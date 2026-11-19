import { randomUUID } from "node:crypto";
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
  LESSON_ERROR_CODES,
  UPLOAD_PART_BYTES,
  VIDEO_MIME_TYPE,
  type LessonVideo,
  type StaffVideo,
  type StartVideoUploadRequest,
  type UploadSession,
  type VideoProgress,
  type VideoProgressRequest,
} from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { ValidationFailed } from "../../platform/zod.pipe.js";
import { AuditService } from "../access/index.js";
import { EntitlementsService } from "../entitlements/index.js";
import { LessonsService } from "../lessons/index.js";
import { safeFileName } from "./file-types.js";
import { signFileGrant, verifyFileGrant } from "./file-token.js";
import { partLength, type Actor } from "./resources.service.js";
import { OBJECT_STORAGE, type ObjectStorage } from "./storage.js";
import { VIDEO_PROVIDER, type VideoProvider } from "./video-provider.js";

type Row = Prisma.LessonVideoGetPayload<object>;
type Tx = Prisma.TransactionClient;

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
/** Watched time may grow at most this many times faster than real time (playback speed up to 2x). */
const MAX_SPEED = 2;
/** Slack for clocks and network delays, in seconds, on each report. */
const SLACK_SECONDS = 5;
const iso = (d: Date) => d.toISOString();
const partKey = (uploadId: string, n: number) => `uploads/${uploadId}/${n}`;

const FAILED_MESSAGE: Record<string, string> = {
  NOT_MP4: "This file is not an MP4 video.",
  DURATION_UNKNOWN: "The video's length could not be read. Export it again as MP4 and retry.",
};

export function toStaffVideo(v: Row): StaffVideo {
  return {
    id: v.id,
    lessonId: v.lessonId,
    status: v.status as StaffVideo["status"],
    provider: v.provider,
    durationSeconds: v.durationSeconds,
    sizeBytes: v.sizeBytes,
    errorCode: v.errorCode,
    version: v.version,
    updatedAt: iso(v.updatedAt),
  };
}

/** Lesson videos through a provider-neutral boundary, plus watch progress and completion. */
@Injectable()
export class VideoService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LessonsService) private readonly lessons: LessonsService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(VIDEO_PROVIDER) private readonly provider: VideoProvider,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private async lessonOf(courseId: string, lessonId: string): Promise<void> {
    const found = await this.db.lesson.findFirst({
      where: { id: lessonId, courseId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException("Lesson not found.");
  }

  // --- staff ---------------------------------------------------------------------------------

  async startUpload(
    actor: Actor,
    courseId: string,
    lessonId: string,
    input: StartVideoUploadRequest,
  ): Promise<UploadSession> {
    await this.lessonOf(courseId, lessonId);
    const partCount = Math.ceil(input.size / UPLOAD_PART_BYTES);
    const row = await this.db.uploadSession.create({
      data: {
        courseId,
        lessonId,
        createdBy: actor.userId,
        fileName: safeFileName(input.fileName),
        mimeType: VIDEO_MIME_TYPE,
        sizeBytes: input.size,
        partSize: UPLOAD_PART_BYTES,
        partCount,
        purpose: "video",
        expiresAt: new Date(Date.now() + UPLOAD_TTL_MS),
      },
    });
    return { uploadId: row.id, partSize: row.partSize, partCount, expiresAt: iso(row.expiresAt) };
  }

  /**
   * Joins the parts into one object, lets the provider take it, and makes it the lesson's video
   * (replacing an earlier one). A file the provider refuses leaves any earlier video in place.
   * Completing twice answers the same video.
   */
  async completeUpload(actor: Actor, courseId: string, uploadId: string): Promise<StaffVideo> {
    const s = await this.db.uploadSession.findFirst({ where: { id: uploadId, courseId } });
    if (!s) throw new NotFoundException("Upload not found.");
    if (s.purpose !== "video") throw new BadRequestException("This upload is a file, not a video.");
    if (s.status === "completed") {
      const v = await this.db.lessonVideo.findUnique({ where: { lessonId: s.lessonId } });
      if (v) return toStaffVideo(v);
    }
    if (s.status !== "open")
      throw new ConflictException("This upload is no longer open. Start the upload again.");
    const keys: string[] = [];
    for (let n = 1; n <= s.partCount; n++) {
      if (
        (await this.storage.size(partKey(uploadId, n))) !== partLength(s.sizeBytes, s.partSize, n)
      ) {
        throw new ConflictException({
          message: `Part ${n} is missing. Send it again, then finish the upload.`,
          code: "UPLOAD_INCOMPLETE",
        });
      }
      keys.push(partKey(uploadId, n));
    }
    const key = `videos/${courseId}/${randomUUID()}`;
    await this.storage.compose(keys, key);
    const result = await this.provider.ingest(key, s.sizeBytes);
    if (result.status === "failed") {
      await this.storage.delete(key);
      await this.db.uploadSession.updateMany({
        where: { id: uploadId, status: "open" },
        data: { status: "cancelled" },
      });
      await this.storage.delete(`uploads/${uploadId}`);
      throw new ValidationFailed([
        {
          field: "file",
          message: FAILED_MESSAGE[result.errorCode] ?? "This video could not be processed.",
        },
      ]);
    }
    let oldRef: string | null = null;
    let row: Row;
    try {
      row = await this.db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ status: string }[]>`
          SELECT status FROM upload_sessions WHERE id = ${uploadId}::uuid FOR UPDATE`;
        if (locked[0]?.status === "completed") {
          return tx.lessonVideo.findUniqueOrThrow({ where: { lessonId: s.lessonId } });
        }
        if (locked[0]?.status !== "open")
          throw new ConflictException("This upload is no longer open.");
        const current = await tx.lessonVideo.findUnique({ where: { lessonId: s.lessonId } });
        oldRef = current?.providerRef ?? null;
        const data = {
          provider: this.provider.name,
          providerRef: result.ref,
          status: "ready",
          durationSeconds: result.durationSeconds,
          sizeBytes: s.sizeBytes,
          errorCode: null,
        };
        const saved = current
          ? await tx.lessonVideo.update({
              where: { id: current.id },
              data: { ...data, version: { increment: 1 } },
            })
          : await tx.lessonVideo.create({
              data: {
                ...data,
                courseId: s.courseId,
                lessonId: s.lessonId,
                createdBy: actor.userId,
              },
            });
        // A new video starts everyone's watching again; completions already earned stay.
        if (current) await tx.videoProgress.deleteMany({ where: { lessonId: s.lessonId } });
        await tx.uploadSession.update({ where: { id: uploadId }, data: { status: "completed" } });
        await this.audit.record(tx, {
          actorKind: "user",
          actorUserId: actor.userId,
          action: current ? "video.replace" : "video.create",
          targetType: "lesson_video",
          targetId: saved.id,
          outcome: "success",
          after: {
            lessonId: s.lessonId,
            sizeBytes: s.sizeBytes,
            durationSeconds: result.durationSeconds,
          },
          requestId: actor.requestId ?? null,
        });
        return saved;
      });
    } catch (e) {
      await this.storage.delete(key);
      throw e;
    }
    if (row.providerRef !== key) await this.storage.delete(key);
    if (oldRef && oldRef !== row.providerRef) await this.provider.remove(oldRef);
    await this.storage.delete(`uploads/${uploadId}`);
    return toStaffVideo(row);
  }

  async getStaff(courseId: string, lessonId: string): Promise<{ video: StaffVideo | null }> {
    await this.lessonOf(courseId, lessonId);
    const v = await this.db.lessonVideo.findFirst({ where: { lessonId, courseId } });
    return { video: v ? toStaffVideo(v) : null };
  }

  /** Removing twice still succeeds. Watch progress for it goes too; completions stay. */
  async remove(actor: Actor, courseId: string, lessonId: string): Promise<{ deleted: boolean }> {
    const ref = await this.db.$transaction(async (tx) => {
      const v = await tx.lessonVideo.findFirst({ where: { lessonId, courseId } });
      if (!v) return null;
      await tx.lessonVideo.delete({ where: { id: v.id } });
      await tx.videoProgress.deleteMany({ where: { lessonId } });
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actor.userId,
        action: "video.delete",
        targetType: "lesson_video",
        targetId: v.id,
        outcome: "success",
        before: { lessonId, durationSeconds: v.durationSeconds },
        requestId: actor.requestId ?? null,
      });
      return v.providerRef ?? "";
    });
    if (ref) await this.provider.remove(ref);
    return { deleted: ref !== null };
  }

  // --- students ------------------------------------------------------------------------------

  private required(duration: number): number {
    return Math.ceil((duration * this.config.VIDEO_COMPLETION_PERCENT) / 100);
  }

  private async progressOf(
    tx: Tx | PrismaService,
    userId: string,
    lessonId: string,
    duration: number,
  ): Promise<VideoProgress> {
    const [p, done] = await Promise.all([
      tx.videoProgress.findUnique({ where: { userId_lessonId: { userId, lessonId } } }),
      tx.lessonCompletion.findUnique({ where: { userId_lessonId: { userId, lessonId } } }),
    ]);
    return {
      positionSeconds: p?.positionSeconds ?? 0,
      watchedSeconds: p?.watchedSeconds ?? 0,
      completed: done !== null,
      requiredSeconds: this.required(duration),
    };
  }

  /** Same access as the lesson text. Only a ready video is shown; progress only to owners. */
  async getForViewer(
    courseId: string,
    lessonId: string,
    viewerId?: string,
  ): Promise<{ video: LessonVideo | null }> {
    await this.lessons.readPublic(courseId, lessonId, viewerId);
    const v = await this.db.lessonVideo.findFirst({
      where: { lessonId, courseId, status: "ready" },
    });
    if (!v || !v.durationSeconds) return { video: null };
    const owner = viewerId !== undefined && (await this.entitlements.hasActive(viewerId, courseId));
    const expiresAt = Date.now() + this.config.VIDEO_LINK_TTL_SECONDS * 1000;
    const token = signFileGrant(
      { resourceId: v.id, subject: viewerId ?? "public", download: false, expiresAt },
      this.config.ACCESS_TOKEN_SECRET,
    );
    return {
      video: {
        durationSeconds: v.durationSeconds,
        playback: {
          url: this.provider.playbackPath(v.id, token),
          expiresAt: new Date(expiresAt).toISOString(),
        },
        progress:
          owner && viewerId
            ? await this.progressOf(this.db, viewerId, lessonId, v.durationSeconds)
            : null,
      },
    };
  }

  /**
   * Bytes for a valid playback link, whole or one range. Returns null for an invalid link or a
   * video that is gone, and "unsatisfiable" for a range outside the file.
   */
  async stream(
    videoId: string,
    token: string,
    range: string | undefined,
  ): Promise<
    | null
    | "unsatisfiable"
    | { stream: Readable; start: number; end: number; size: number; partial: boolean }
  > {
    if (!verifyFileGrant(token, videoId, this.config.ACCESS_TOKEN_SECRET)) return null;
    const v = await this.db.lessonVideo.findUnique({ where: { id: videoId } });
    if (!v || v.status !== "ready" || !v.providerRef || !v.sizeBytes) return null;
    const size = v.sizeBytes;
    const r = parseRange(range, size);
    if (r === "unsatisfiable") return r;
    const [start, end] = r ?? [0, size - 1];
    return {
      stream: this.storage.readRange(v.providerRef, start, end),
      start,
      end,
      size,
      partial: r !== null,
    };
  }

  /**
   * Records watching. The claimed time is capped by the time since the last report (at up to 2x
   * speed plus a little slack), so repeated or inflated reports cannot complete a lesson. At the
   * completion share of the video's length the lesson is marked complete, once.
   */
  async heartbeat(
    userId: string,
    courseId: string,
    lessonId: string,
    input: VideoProgressRequest,
  ): Promise<VideoProgress> {
    if (!(await this.entitlements.hasActive(userId, courseId))) {
      throw new ForbiddenException({
        message: "Enroll in this course to track your progress.",
        code: LESSON_ERROR_CODES.enrollmentRequired,
      });
    }
    const v = await this.db.lessonVideo.findFirst({
      where: { lessonId, courseId, status: "ready" },
    });
    if (!v || !v.durationSeconds) throw new NotFoundException("This lesson has no video.");
    const duration = v.durationSeconds;
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO video_progress (user_id, lesson_id, course_id)
        VALUES (${userId}::uuid, ${lessonId}::uuid, ${courseId}::uuid)
        ON CONFLICT (user_id, lesson_id) DO NOTHING`;
      const rows = await tx.$queryRaw<{ watched_seconds: number; elapsed: number }[]>`
        SELECT watched_seconds, EXTRACT(EPOCH FROM (now() - last_beat_at))::float AS elapsed
        FROM video_progress WHERE user_id = ${userId}::uuid AND lesson_id = ${lessonId}::uuid FOR UPDATE`;
      const current = rows[0]!;
      const allowed = Math.min(
        input.watchedDeltaSeconds,
        Math.ceil(current.elapsed * MAX_SPEED) + SLACK_SECONDS,
      );
      const watched = Math.min(duration, current.watched_seconds + Math.max(0, allowed));
      await tx.$executeRaw`
        UPDATE video_progress SET watched_seconds = ${watched},
          position_seconds = ${Math.min(input.positionSeconds, duration)},
          last_beat_at = now(), updated_at = now()
        WHERE user_id = ${userId}::uuid AND lesson_id = ${lessonId}::uuid`;
      if (watched >= this.required(duration)) {
        await tx.$executeRaw`
          INSERT INTO lesson_completions (user_id, lesson_id, course_id)
          VALUES (${userId}::uuid, ${lessonId}::uuid, ${courseId}::uuid)
          ON CONFLICT (user_id, lesson_id) DO NOTHING`;
      }
      return this.progressOf(tx, userId, lessonId, duration);
    });
  }

  async deleteForAccount(tx: Tx, userId: string): Promise<void> {
    await tx.videoProgress.deleteMany({ where: { userId } });
  }
}

/** "bytes=a-b", "bytes=a-" or "bytes=-n" for one range; null means the whole file. */
export function parseRange(
  header: string | undefined,
  size: number,
): [number, number] | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return [start, end];
}
