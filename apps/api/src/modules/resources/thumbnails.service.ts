import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { THUMBNAIL_MAX_BYTES } from "@chartnexa/api-contracts";
import { PrismaService } from "../../database/prisma.service.js";
import { ValidationFailed } from "../../platform/zod.pipe.js";
import { AuditService } from "../access/index.js";
import { OBJECT_STORAGE, type ObjectStorage } from "./storage.js";

type Mime = "image/png" | "image/jpeg" | "image/webp";

/** The type is decided from the bytes, never from what the client says. */
export function sniffImage(b: Buffer): Mime | null {
  if (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 12 &&
    b.toString("latin1", 0, 4) === "RIFF" &&
    b.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export interface Actor {
  userId: string;
  requestId?: string | undefined;
}

/** Course thumbnails: validated image bytes in object storage, referenced from the course row. */
@Injectable()
export class ThumbnailsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** Replaces the course's thumbnail. The new bytes are stored first, the old ones removed after. */
  async set(actor: Actor, courseId: string, body: unknown): Promise<{ thumbnailUrl: string }> {
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException("Send the image as application/octet-stream.");
    }
    if (body.length > THUMBNAIL_MAX_BYTES) {
      throw new ValidationFailed([
        {
          field: "file",
          message: `Use an image of at most ${THUMBNAIL_MAX_BYTES / 1024 / 1024} MB`,
        },
      ]);
    }
    const mime = sniffImage(body);
    if (!mime) {
      throw new ValidationFailed([{ field: "file", message: "Use a PNG, JPEG or WebP image" }]);
    }
    const id = randomUUID();
    await this.storage.put(`thumbnails/${id}`, body);
    let oldId: string | null = null;
    try {
      await this.db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ thumbnail_id: string | null }[]>`
          SELECT thumbnail_id FROM courses WHERE id = ${courseId}::uuid FOR UPDATE`;
        if (locked.length === 0) throw new NotFoundException("Course not found.");
        oldId = locked[0]?.thumbnail_id ?? null;
        await tx.course.update({
          where: { id: courseId },
          data: { thumbnailId: id, thumbnailMime: mime },
        });
        await this.audit.record(tx, {
          actorKind: "user",
          actorUserId: actor.userId,
          action: "course.thumbnail.set",
          targetType: "course",
          targetId: courseId,
          outcome: "success",
          after: { thumbnailId: id, mime, bytes: body.length },
          requestId: actor.requestId ?? null,
        });
      });
    } catch (e) {
      await this.storage.delete(`thumbnails/${id}`);
      throw e;
    }
    if (oldId) await this.storage.delete(`thumbnails/${oldId}`);
    return { thumbnailUrl: `/courses/thumbnails/${id}` };
  }

  /** Back to the colour cover. Repeating it changes nothing. */
  async remove(actor: Actor, courseId: string): Promise<void> {
    let oldId: string | null = null;
    await this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ thumbnail_id: string | null }[]>`
        SELECT thumbnail_id FROM courses WHERE id = ${courseId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException("Course not found.");
      oldId = locked[0]?.thumbnail_id ?? null;
      if (!oldId) return;
      await tx.course.update({
        where: { id: courseId },
        data: { thumbnailId: null, thumbnailMime: null },
      });
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actor.userId,
        action: "course.thumbnail.remove",
        targetType: "course",
        targetId: courseId,
        outcome: "success",
        before: { thumbnailId: oldId },
        requestId: actor.requestId ?? null,
      });
    });
    if (oldId) await this.storage.delete(`thumbnails/${oldId}`);
  }

  /** Public: thumbnails are course marketing images, and their ids cannot be guessed. */
  async open(id: string): Promise<{ stream: Readable; mime: string; size: number } | null> {
    const course = await this.db.course.findUnique({
      where: { thumbnailId: id },
      select: { thumbnailMime: true },
    });
    if (!course?.thumbnailMime) return null;
    const size = await this.storage.size(`thumbnails/${id}`);
    if (size === null) return null;
    return { stream: this.storage.read(`thumbnails/${id}`), mime: course.thumbnailMime, size };
  }
}
