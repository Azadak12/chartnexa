import { z } from "zod";

export const VIDEO_MAX_BYTES = 1024 * 1024 * 1024;
export const VIDEO_MIME_TYPE = "video/mp4";
/** Default share of a video that must be watched to complete the lesson (Q07, configurable). */
export const VIDEO_COMPLETION_PERCENT_DEFAULT = 90;
export const VIDEO_ERROR_CODES = {
  notMp4: "NOT_MP4",
  durationUnknown: "DURATION_UNKNOWN",
  videoLesson: "VIDEO_LESSON",
} as const;

export const startVideoUploadRequestSchema = z.strictObject({
  fileName: z
    .string()
    .trim()
    .min(1, "Choose a video")
    .max(200)
    .refine((v) => v.toLowerCase().endsWith(".mp4"), "Use an MP4 video (.mp4)"),
  size: z
    .number()
    .int()
    .min(1, "The video is empty")
    .max(VIDEO_MAX_BYTES, "Videos can be up to 1 GB"),
});

export const VIDEO_STATUSES = ["processing", "ready", "failed"] as const;
export const staffVideoSchema = z.object({
  id: z.string(),
  lessonId: z.string(),
  status: z.enum(VIDEO_STATUSES),
  provider: z.string(),
  durationSeconds: z.number().int().nullable(),
  sizeBytes: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  version: z.number().int(),
  updatedAt: z.string(),
});
export const staffVideoResponseSchema = z.object({ video: staffVideoSchema.nullable() });

export const videoProgressSchema = z.object({
  positionSeconds: z.number().int().min(0),
  watchedSeconds: z.number().int().min(0),
  completed: z.boolean(),
  /** Watched seconds needed to complete the lesson. */
  requiredSeconds: z.number().int().min(0),
});

/** A student's view: only a ready video, a playback link valid for hours, and own progress. */
export const lessonVideoSchema = z.object({
  durationSeconds: z.number().int().min(1),
  playback: z.object({ url: z.string(), expiresAt: z.string() }),
  /** Owners only; null for free-preview viewers who do not own the course. */
  progress: videoProgressSchema.nullable(),
});
export const lessonVideoResponseSchema = z.object({ video: lessonVideoSchema.nullable() });

export const videoProgressRequestSchema = z.strictObject({
  positionSeconds: z.number().int().min(0).max(86_400),
  /** Seconds actually played since the last report; the server caps it by elapsed time. */
  watchedDeltaSeconds: z.number().int().min(0).max(600),
});

export type StartVideoUploadRequest = z.input<typeof startVideoUploadRequestSchema>;
export type StaffVideo = z.infer<typeof staffVideoSchema>;
export type LessonVideo = z.infer<typeof lessonVideoSchema>;
export type VideoProgress = z.infer<typeof videoProgressSchema>;
export type VideoProgressRequest = z.input<typeof videoProgressRequestSchema>;
