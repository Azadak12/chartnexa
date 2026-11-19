import { z } from "zod";

/** Limits for one live class. Times are instants (ISO 8601 with an offset); the app shows them in the device's time zone. */
export const LIVE_TITLE_MIN = 3;
export const LIVE_TITLE_MAX = 120;
export const LIVE_DESCRIPTION_MAX = 2000;
export const LIVE_DURATION_MIN = 15;
export const LIVE_DURATION_MAX = 480;
/** How far ahead a class can be scheduled. */
export const LIVE_MAX_DAYS_AHEAD = 366;
export const LIVE_MAX_UPCOMING_PER_COURSE = 100;
export const LIVE_CANCEL_REASON_MIN = 3;
export const LIVE_CANCEL_REASON_MAX = 300;

export const LIVE_ERROR_CODES = {
  notOpen: "LIVE_NOT_OPEN",
  ended: "LIVE_ENDED",
  cancelled: "LIVE_CANCELLED",
  inPast: "LIVE_IN_PAST",
  tooMany: "LIVE_TOO_MANY",
} as const;

/** What a student sees: `live` from start to end, `ended` after, `cancelled` with its reason. */
export const LIVE_STATES = ["upcoming", "open", "live", "ended", "cancelled"] as const;
export const liveStateSchema = z.enum(LIVE_STATES);

const title = z
  .string()
  .trim()
  .min(LIVE_TITLE_MIN, `Use at least ${LIVE_TITLE_MIN} characters`)
  .max(LIVE_TITLE_MAX, `Use at most ${LIVE_TITLE_MAX} characters`);
const description = z
  .string()
  .trim()
  .max(LIVE_DESCRIPTION_MAX, `Use at most ${LIVE_DESCRIPTION_MAX} characters`);
const startsAt = z.iso.datetime({ offset: true, error: "Use a date and time with a time zone" });
const durationMinutes = z
  .number()
  .int()
  .min(LIVE_DURATION_MIN, `A class lasts at least ${LIVE_DURATION_MIN} minutes`)
  .max(LIVE_DURATION_MAX, `A class lasts at most ${LIVE_DURATION_MAX} minutes`);
/** The meeting link from whichever service hosts the class (manual-link adapter, R38). */
const joinUrl = z
  .url({
    protocol: /^https$/,
    hostname: /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i,
    error: "Use a link that starts with https:// and names a website",
  })
  .max(2000, "Use a shorter link");

export const createLiveSessionRequestSchema = z.strictObject({
  title,
  description: description.optional(),
  startsAt,
  durationMinutes,
  joinUrl,
});
export const updateLiveSessionRequestSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
  title: title.optional(),
  description: description.optional(),
  startsAt: startsAt.optional(),
  durationMinutes: durationMinutes.optional(),
  joinUrl: joinUrl.optional(),
});
export const cancelLiveSessionRequestSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
  reason: z
    .string()
    .trim()
    .min(LIVE_CANCEL_REASON_MIN, `Use at least ${LIVE_CANCEL_REASON_MIN} characters`)
    .max(LIVE_CANCEL_REASON_MAX, `Use at most ${LIVE_CANCEL_REASON_MAX} characters`),
});

const base = {
  id: z.string(),
  courseId: z.string(),
  title: z.string(),
  description: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  durationMinutes: z.number().int(),
  state: liveStateSchema,
  /** When the join link becomes available. */
  joinOpensAt: z.string(),
  cancelReason: z.string().nullable(),
};
/** Students never receive the link in a list; they ask for it with the join call once it opens. */
export const liveSessionSchema = z.object({ ...base, courseTitle: z.string() });
export const liveSessionListSchema = z.object({ items: z.array(liveSessionSchema) });
export const staffLiveSessionSchema = z.object({
  ...base,
  joinUrl: z.string(),
  provider: z.string(),
  version: z.number().int(),
  joinedCount: z.number().int(),
  createdAt: z.string(),
  cancelledAt: z.string().nullable(),
});
export const staffLiveSessionListSchema = z.object({ items: z.array(staffLiveSessionSchema) });
export const liveJoinSchema = z.object({ url: z.string(), endsAt: z.string() });

export type LiveState = z.infer<typeof liveStateSchema>;
export type CreateLiveSessionRequest = z.infer<typeof createLiveSessionRequestSchema>;
export type UpdateLiveSessionRequest = z.infer<typeof updateLiveSessionRequestSchema>;
export type CancelLiveSessionRequest = z.infer<typeof cancelLiveSessionRequestSchema>;
export type LiveSession = z.infer<typeof liveSessionSchema>;
export type LiveSessionList = z.infer<typeof liveSessionListSchema>;
export type StaffLiveSession = z.infer<typeof staffLiveSessionSchema>;
export type StaffLiveSessionList = z.infer<typeof staffLiveSessionListSchema>;
export type LiveJoin = z.infer<typeof liveJoinSchema>;
