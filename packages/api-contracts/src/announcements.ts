import { z } from "zod";

export const ANNOUNCEMENT_TITLE_MIN = 3;
export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 4000;
export const ANNOUNCEMENT_REASON_MIN = 3;
export const ANNOUNCEMENT_REASON_MAX = 300;

/** Plain text only: the app never renders markup or links from an announcement. */
export const createAnnouncementRequestSchema = z.strictObject({
  title: z
    .string()
    .trim()
    .min(
      ANNOUNCEMENT_TITLE_MIN,
      `Use ${ANNOUNCEMENT_TITLE_MIN} to ${ANNOUNCEMENT_TITLE_MAX} characters`,
    )
    .max(
      ANNOUNCEMENT_TITLE_MAX,
      `Use ${ANNOUNCEMENT_TITLE_MIN} to ${ANNOUNCEMENT_TITLE_MAX} characters`,
    ),
  body: z
    .string()
    .trim()
    .min(1, "Write the announcement")
    .max(ANNOUNCEMENT_BODY_MAX, `Use at most ${ANNOUNCEMENT_BODY_MAX} characters`),
  /** Omit for everyone; a course id sends it to people with access to that course. */
  courseId: z.uuid().optional(),
  /** Retrying with the same key returns the first announcement instead of posting twice. */
  idempotencyKey: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,100}$/, "Use 8 to 100 letters, digits, - or _"),
});
export const withdrawAnnouncementRequestSchema = z.strictObject({
  reason: z
    .string()
    .trim()
    .min(
      ANNOUNCEMENT_REASON_MIN,
      `Use ${ANNOUNCEMENT_REASON_MIN} to ${ANNOUNCEMENT_REASON_MAX} characters`,
    )
    .max(
      ANNOUNCEMENT_REASON_MAX,
      `Use ${ANNOUNCEMENT_REASON_MIN} to ${ANNOUNCEMENT_REASON_MAX} characters`,
    ),
});
export const announcementPageQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(512).optional(),
});

export const announcementSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  courseId: z.string().nullable(),
  courseTitle: z.string().nullable(),
  publishedAt: z.string(),
  read: z.boolean(),
});
export const announcementPageSchema = z.object({
  items: z.array(announcementSchema),
  nextCursor: z.string().nullable(),
});
export const unreadCountSchema = z.object({ unread: z.number().int().min(0) });

export const staffAnnouncementSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  courseId: z.string().nullable(),
  courseTitle: z.string().nullable(),
  status: z.enum(["published", "withdrawn"]),
  publishedAt: z.string(),
  withdrawnAt: z.string().nullable(),
  withdrawReason: z.string().nullable(),
  authorId: z.string().nullable(),
  readCount: z.number().int(),
});
export const staffAnnouncementPageSchema = z.object({
  items: z.array(staffAnnouncementSchema),
  nextCursor: z.string().nullable(),
});

export type CreateAnnouncementRequest = z.infer<typeof createAnnouncementRequestSchema>;
export type WithdrawAnnouncementRequest = z.infer<typeof withdrawAnnouncementRequestSchema>;
export type AnnouncementPageQuery = z.infer<typeof announcementPageQuerySchema>;
export type Announcement = z.infer<typeof announcementSchema>;
export type StaffAnnouncement = z.infer<typeof staffAnnouncementSchema>;
