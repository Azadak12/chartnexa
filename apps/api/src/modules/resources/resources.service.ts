import { createHash, randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  MAX_RESOURCES_PER_LESSON,
  UPLOAD_PART_BYTES,
  type CompleteUploadRequest,
  type FileLink,
  type PublicResource,
  type StaffResource,
  type StartUploadRequest,
  type UpdateResourceRequest,
  type UploadSession,
} from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { ValidationFailed } from "../../platform/zod.pipe.js";
import { AuditService } from "../access/index.js";
import { LessonsService } from "../lessons/index.js";
import { ALLOWED_TYPES, safeFileName, sniffType, type AllowedType } from "./file-types.js";
import { signFileGrant, verifyFileGrant } from "./file-token.js";
import { MALWARE_SCANNER, type MalwareScanner } from "./scanner.js";
import { OBJECT_STORAGE, type ObjectStorage } from "./storage.js";

type Row = Prisma.LessonResourceGetPayload<object>;
export interface Actor {
  userId: string;
  requestId?: string | undefined;
}

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
/** Bytes without a resource row are kept this long in case their upload is still committing. */
export const ORPHAN_GRACE_MS = 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString();
const partKey = (uploadId: string, n: number) => `uploads/${uploadId}/${n}`;
const LIMIT = `A lesson can have at most ${MAX_RESOURCES_PER_LESSON} files.`;

export function toStaffResource(r: Row): StaffResource {
  return {
    id: r.id,
    lessonId: r.lessonId,
    title: r.title,
    fileName: r.fileName,
    mimeType: r.mimeType as StaffResource["mimeType"],
    sizeBytes: r.sizeBytes,
    downloadable: r.downloadable,
    scanStatus: r.scanStatus as StaffResource["scanStatus"],
    version: r.version,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}
const toPublic = (r: Row): PublicResource => ({
  id: r.id,
  title: r.title,
  fileName: r.fileName,
  mimeType: r.mimeType as PublicResource["mimeType"],
  sizeBytes: r.sizeBytes,
  downloadable: r.downloadable,
});

/** Expected bytes of part n (1-based): every part is full except possibly the last. */
export function partLength(size: number, partSize: number, n: number): number {
  const count = Math.ceil(size / partSize);
  return n < count ? partSize : size - partSize * (count - 1);
}

@Injectable()
export class ResourcesService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LessonsService) private readonly lessons: LessonsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private async lessonOf(courseId: string, lessonId: string): Promise<void> {
    const found = await this.db.lesson.findFirst({
      where: { id: lessonId, courseId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException("Lesson not found.");
  }

  // --- uploads -------------------------------------------------------------------------------

  async start(
    actor: Actor,
    courseId: string,
    lessonId: string,
    input: StartUploadRequest,
  ): Promise<UploadSession> {
    await this.lessonOf(courseId, lessonId);
    const ext = input.fileName.toLowerCase().split(".").pop() ?? "";
    const allowed = ALLOWED_TYPES[input.mimeType as AllowedType].ext as readonly string[];
    if (!allowed.includes(ext)) {
      throw new ValidationFailed([
        { field: "fileName", message: `The file name should end in .${allowed[0]}` },
      ]);
    }
    if ((await this.db.lessonResource.count({ where: { lessonId } })) >= MAX_RESOURCES_PER_LESSON) {
      throw new ConflictException(LIMIT);
    }
    const partCount = Math.ceil(input.size / UPLOAD_PART_BYTES);
    const row = await this.db.uploadSession.create({
      data: {
        courseId,
        lessonId,
        createdBy: actor.userId,
        fileName: safeFileName(input.fileName),
        mimeType: input.mimeType,
        sizeBytes: input.size,
        partSize: UPLOAD_PART_BYTES,
        partCount,
        expiresAt: new Date(Date.now() + UPLOAD_TTL_MS),
      },
    });
    return { uploadId: row.id, partSize: row.partSize, partCount, expiresAt: iso(row.expiresAt) };
  }

  private async openSession(courseId: string, uploadId: string) {
    const s = await this.db.uploadSession.findFirst({ where: { id: uploadId, courseId } });
    if (!s) throw new NotFoundException("Upload not found.");
    return s;
  }

  /** Stores one part. Sending the same part again replaces it, so a retry is always safe. */
  async putPart(
    courseId: string,
    uploadId: string,
    n: number,
    body: unknown,
  ): Promise<{ received: number }> {
    const s = await this.openSession(courseId, uploadId);
    if (s.status !== "open" || s.expiresAt.getTime() < Date.now()) {
      throw new ConflictException("This upload is no longer open. Start the upload again.");
    }
    if (!Number.isInteger(n) || n < 1 || n > s.partCount) {
      throw new BadRequestException(`Part number must be from 1 to ${s.partCount}.`);
    }
    if (!Buffer.isBuffer(body)) {
      throw new BadRequestException("Send the part as application/octet-stream.");
    }
    const want = partLength(s.sizeBytes, s.partSize, n);
    if (body.length !== want) {
      throw new BadRequestException(`Part ${n} must be exactly ${want} bytes.`);
    }
    await this.storage.put(partKey(uploadId, n), body);
    return { received: n };
  }

  private async deleteParts(uploadId: string): Promise<void> {
    await this.storage.delete(`uploads/${uploadId}`);
  }

  /** Cancelling twice, or a completed or unknown upload, still succeeds. */
  async cancel(courseId: string, uploadId: string): Promise<{ cancelled: boolean }> {
    const s = await this.db.uploadSession.findFirst({ where: { id: uploadId, courseId } });
    if (!s || s.status !== "open") return { cancelled: false };
    const res = await this.db.uploadSession.updateMany({
      where: { id: uploadId, status: "open" },
      data: { status: "cancelled" },
    });
    await this.deleteParts(uploadId);
    return { cancelled: res.count === 1 };
  }

  /**
   * Assembles the parts, checks the bytes are the declared type, scans them, and stores the file
   * as a new resource (or as the new file of an existing one). Completing twice answers the same
   * resource. A file that fails a check is refused and its parts are removed.
   */
  async complete(
    actor: Actor,
    courseId: string,
    uploadId: string,
    input: CompleteUploadRequest,
  ): Promise<StaffResource> {
    const s = await this.openSession(courseId, uploadId);
    if (s.status === "completed" && s.resourceId) {
      const done = await this.db.lessonResource.findUnique({ where: { id: s.resourceId } });
      if (done) return toStaffResource(done);
    }
    if (s.status !== "open")
      throw new ConflictException("This upload is no longer open. Start the upload again.");

    const parts: Buffer[] = [];
    for (let n = 1; n <= s.partCount; n++) {
      const size = await this.storage.size(partKey(uploadId, n));
      if (size !== partLength(s.sizeBytes, s.partSize, n)) {
        throw new ConflictException({
          message: `Part ${n} is missing. Send it again, then finish the upload.`,
          code: "UPLOAD_INCOMPLETE",
        });
      }
      parts.push(await readAll(this.storage.read(partKey(uploadId, n))));
    }
    const data = Buffer.concat(parts);
    const reject = async (message: string): Promise<never> => {
      await this.db.uploadSession.updateMany({
        where: { id: uploadId, status: "open" },
        data: { status: "cancelled" },
      });
      await this.deleteParts(uploadId);
      throw new ValidationFailed([{ field: "file", message }]);
    };
    const actual = sniffType(data);
    if (actual !== s.mimeType)
      await reject("The file's content does not match its type, or the type is not supported.");
    const scan = await this.scanner.scan(data);
    if (scan === "infected") await reject("This file was rejected by the malware scan.");

    const sha256 = createHash("sha256").update(data).digest("hex");
    const key = `resources/${s.courseId}/${randomUUID()}`;
    await this.storage.put(key, data);
    let oldKey: string | null = null;
    let row: Row;
    try {
      row = await this.db.$transaction(async (tx) => {
        // Serializes completes for one upload: a second complete waits, then sees "completed".
        const locked = await tx.$queryRaw<{ status: string; resource_id: string | null }[]>`
          SELECT status, resource_id FROM upload_sessions WHERE id = ${uploadId}::uuid FOR UPDATE`;
        if (locked[0]?.status === "completed" && locked[0].resource_id) {
          return tx.lessonResource.findUniqueOrThrow({ where: { id: locked[0].resource_id } });
        }
        if (locked[0]?.status !== "open")
          throw new ConflictException("This upload is no longer open.");
        let saved: Row;
        if (input.replaceResourceId) {
          const current = await tx.lessonResource.findFirst({
            where: { id: input.replaceResourceId, lessonId: s.lessonId },
          });
          if (!current) throw new NotFoundException("File not found.");
          oldKey = current.storageKey;
          saved = await tx.lessonResource.update({
            where: { id: current.id },
            data: {
              title: input.title,
              fileName: s.fileName,
              mimeType: s.mimeType,
              sizeBytes: data.length,
              sha256,
              storageKey: key,
              scanStatus: scan,
              downloadable: input.downloadable ?? current.downloadable,
              version: { increment: 1 },
            },
          });
        } else {
          const count = await tx.lessonResource.count({ where: { lessonId: s.lessonId } });
          if (count >= MAX_RESOURCES_PER_LESSON) throw new ConflictException(LIMIT);
          saved = await tx.lessonResource.create({
            data: {
              courseId: s.courseId,
              lessonId: s.lessonId,
              title: input.title,
              fileName: s.fileName,
              mimeType: s.mimeType,
              sizeBytes: data.length,
              sha256,
              storageKey: key,
              scanStatus: scan,
              downloadable: input.downloadable ?? false,
              createdBy: actor.userId,
            },
          });
        }
        await tx.uploadSession.update({
          where: { id: uploadId },
          data: { status: "completed", resourceId: saved.id },
        });
        await this.audit.record(tx, {
          actorKind: "user",
          actorUserId: actor.userId,
          action: input.replaceResourceId ? "resource.replace" : "resource.create",
          targetType: "lesson_resource",
          targetId: saved.id,
          outcome: "success",
          after: {
            lessonId: s.lessonId,
            mimeType: s.mimeType,
            sizeBytes: data.length,
            scanStatus: scan,
          },
          requestId: actor.requestId ?? null,
        });
        return saved;
      });
    } catch (e) {
      await this.storage.delete(key);
      throw e;
    }
    // The new bytes are committed; the old ones (on replace) and the parts can go.
    if (row.storageKey !== key) await this.storage.delete(key); // a racing complete won
    if (oldKey) await this.storage.delete(oldKey);
    await this.deleteParts(uploadId);
    return toStaffResource(row);
  }

  // --- staff resources -----------------------------------------------------------------------

  async listStaff(courseId: string, lessonId: string): Promise<{ items: StaffResource[] }> {
    await this.lessonOf(courseId, lessonId);
    const rows = await this.db.lessonResource.findMany({
      where: { lessonId, courseId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return { items: rows.map(toStaffResource) };
  }

  async update(
    actor: Actor,
    courseId: string,
    lessonId: string,
    resourceId: string,
    input: UpdateResourceRequest,
  ): Promise<StaffResource> {
    return this.db.$transaction(async (tx) => {
      const current = await tx.lessonResource.findFirst({
        where: { id: resourceId, lessonId, courseId },
      });
      if (!current) throw new NotFoundException("File not found.");
      const res = await tx.lessonResource.updateMany({
        where: { id: resourceId, version: input.expectedVersion },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.downloadable !== undefined ? { downloadable: input.downloadable } : {}),
          version: { increment: 1 },
        },
      });
      if (res.count === 0) {
        throw new ConflictException("This file was changed by someone else. Reload and try again.");
      }
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actor.userId,
        action: "resource.update",
        targetType: "lesson_resource",
        targetId: resourceId,
        outcome: "success",
        before: { downloadable: current.downloadable },
        after: { downloadable: input.downloadable ?? current.downloadable },
        requestId: actor.requestId ?? null,
      });
      return toStaffResource(
        await tx.lessonResource.findUniqueOrThrow({ where: { id: resourceId } }),
      );
    });
  }

  /** Deleting twice still succeeds. The bytes are removed after the row is gone. */
  async remove(
    actor: Actor,
    courseId: string,
    lessonId: string,
    resourceId: string,
  ): Promise<{ deleted: boolean }> {
    const key = await this.db.$transaction(async (tx) => {
      const current = await tx.lessonResource.findFirst({
        where: { id: resourceId, lessonId, courseId },
      });
      if (!current) return null;
      await tx.lessonResource.delete({ where: { id: resourceId } });
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actor.userId,
        action: "resource.delete",
        targetType: "lesson_resource",
        targetId: resourceId,
        outcome: "success",
        before: { lessonId, mimeType: current.mimeType, sizeBytes: current.sizeBytes },
        requestId: actor.requestId ?? null,
      });
      return current.storageKey;
    });
    if (key) await this.storage.delete(key);
    return { deleted: key !== null };
  }

  // --- students ------------------------------------------------------------------------------

  /** Same rule as the lesson text: a free preview, or an owner of the course. */
  private async assertCanRead(
    courseId: string,
    lessonId: string,
    viewerId?: string,
  ): Promise<void> {
    await this.lessons.readPublic(courseId, lessonId, viewerId);
  }

  async listPublic(
    courseId: string,
    lessonId: string,
    viewerId?: string,
  ): Promise<{ items: PublicResource[] }> {
    await this.assertCanRead(courseId, lessonId, viewerId);
    const rows = await this.db.lessonResource.findMany({
      where: { lessonId, courseId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return { items: rows.map(toPublic) };
  }

  async link(
    courseId: string,
    lessonId: string,
    resourceId: string,
    viewerId: string | undefined,
    download: boolean,
  ): Promise<FileLink> {
    await this.assertCanRead(courseId, lessonId, viewerId);
    const r = await this.db.lessonResource.findFirst({
      where: { id: resourceId, lessonId, courseId },
    });
    if (!r) throw new NotFoundException("File not found.");
    if (download && !r.downloadable) {
      throw new ForbiddenException({
        message: "This file can be viewed in the app but not downloaded.",
        code: "DOWNLOAD_NOT_ALLOWED",
      });
    }
    const expiresAt = Date.now() + this.config.FILE_LINK_TTL_SECONDS * 1000;
    const token = signFileGrant(
      { resourceId, subject: viewerId ?? "public", download, expiresAt },
      this.config.ACCESS_TOKEN_SECRET,
    );
    return {
      url: `/files/${resourceId}?t=${encodeURIComponent(token)}`,
      expiresAt: new Date(expiresAt).toISOString(),
      download,
    };
  }

  /** What /files needs to send the bytes, or null when the link is invalid, expired or gone. */
  async open(
    resourceId: string,
    token: string,
  ): Promise<{
    stream: Readable;
    mimeType: string;
    size: number;
    fileName: string;
    download: boolean;
  } | null> {
    const grant = verifyFileGrant(token, resourceId, this.config.ACCESS_TOKEN_SECRET);
    if (!grant) return null;
    const r = await this.db.lessonResource.findUnique({ where: { id: resourceId } });
    if (!r) return null;
    if (grant.download && !r.downloadable) return null;
    return {
      stream: this.storage.read(r.storageKey),
      mimeType: r.mimeType,
      size: r.sizeBytes,
      fileName: r.fileName,
      download: grant.download,
    };
  }

  // --- cleanup -------------------------------------------------------------------------------

  /**
   * Removes expired uploads and their parts, and bytes no resource points at (for example after a
   * lesson was deleted). Safe to run at any time and on several instances.
   */
  async cleanup(now = new Date()): Promise<{ expiredUploads: number; orphanObjects: number }> {
    const expired = await this.db.uploadSession.findMany({
      where: { status: "open", expiresAt: { lt: now } },
      select: { id: true },
      take: 500,
    });
    for (const s of expired) {
      await this.db.uploadSession.updateMany({
        where: { id: s.id, status: "open" },
        data: { status: "cancelled" },
      });
      await this.deleteParts(s.id);
    }
    const objects = await this.storage.list("resources");
    const keys = objects.map((o) => o.key);
    const known = new Set(
      (
        await this.db.lessonResource.findMany({
          where: { storageKey: { in: keys } },
          select: { storageKey: true },
        })
      ).map((r) => r.storageKey),
    );
    // A file written moments ago may belong to a complete that has not committed yet: keep
    // anything younger than the grace period.
    let orphans = 0;
    for (const o of objects) {
      if (known.has(o.key) || now.getTime() - o.modifiedAt.getTime() < ORPHAN_GRACE_MS) continue;
      orphans += 1;
      await this.storage.delete(o.key);
    }
    return { expiredUploads: expired.length, orphanObjects: orphans };
  }
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}
