import {
  lessonVideoResponseSchema,
  staffVideoResponseSchema,
  staffVideoSchema,
  uploadSessionSchema,
  videoProgressSchema,
  type LessonVideo,
  type StaffVideo,
  type UploadSession,
  type VideoProgress,
} from "@chartnexa/api-contracts";
import { z } from "zod";
import { AppError, messageFor } from "../api/errors";
import { viewerFetch } from "../api/viewer-fetch";
import { authedFetch } from "../auth/authed-fetch";
import { sendParts } from "../resources/upload";

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}
const enc = encodeURIComponent;

export const videoApi = {
  /** The lesson's ready video and a playback link (hours long), or null. */
  async get(courseId: string, lessonId: string): Promise<LessonVideo | null> {
    return check(
      lessonVideoResponseSchema,
      await viewerFetch(`/courses/${enc(courseId)}/lessons/${enc(lessonId)}/video`),
    ).video;
  },
  async report(
    courseId: string,
    lessonId: string,
    positionSeconds: number,
    watchedDeltaSeconds: number,
  ): Promise<VideoProgress> {
    return check(
      videoProgressSchema,
      await authedFetch(`/me/courses/${enc(courseId)}/lessons/${enc(lessonId)}/video-progress`, {
        method: "PUT",
        body: { positionSeconds, watchedDeltaSeconds },
      }),
    );
  },
};

export const staffVideoApi = {
  async get(courseId: string, lessonId: string): Promise<StaffVideo | null> {
    return check(
      staffVideoResponseSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/lessons/${enc(lessonId)}/video`),
    ).video;
  },
  async start(
    courseId: string,
    lessonId: string,
    fileName: string,
    size: number,
  ): Promise<UploadSession> {
    return check(
      uploadSessionSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/lessons/${enc(lessonId)}/video/uploads`, {
        method: "POST",
        body: { fileName, size },
      }),
    );
  },
  async complete(courseId: string, uploadId: string): Promise<StaffVideo> {
    return check(
      staffVideoSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/uploads/${enc(uploadId)}/complete-video`, {
        method: "POST",
        timeoutMs: 300_000,
      }),
    );
  },
  async remove(courseId: string, lessonId: string): Promise<void> {
    await authedFetch(`/staff/courses/${enc(courseId)}/lessons/${enc(lessonId)}/video`, {
      method: "DELETE",
    });
  },
};

/** Uploads an MP4 in parts and makes it the lesson's video. */
export async function uploadVideo(input: {
  courseId: string;
  lessonId: string;
  uri: string;
  fileName: string;
  size: number;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<StaffVideo> {
  const session = await staffVideoApi.start(
    input.courseId,
    input.lessonId,
    input.fileName,
    input.size,
  );
  await sendParts({ ...input, session });
  return staffVideoApi.complete(input.courseId, session.uploadId);
}

/** "1:05:09" or "4:07". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** "12 minutes" in words, for labels and screen readers. */
export function minutesText(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  return `${m} ${m === 1 ? "minute" : "minutes"}`;
}
