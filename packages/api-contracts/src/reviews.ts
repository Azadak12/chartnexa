import { z } from "zod";
import { MAX_PAGE_SIZE } from "./pagination.js";

export const REVIEW_BODY_MAX = 1000;
export const REVIEW_PAGE_SIZE = 10;

// Plain text only: newlines and tabs are allowed, other control characters are not.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** How many reviews a course has and their average to one decimal; `average` is null with none. */
export const courseRatingSchema = z.object({
  count: z.number().int().min(0),
  average: z.number().min(1).max(5).nullable(),
});
export const NO_RATING = { count: 0, average: null } as const;

export const writeReviewRequestSchema = z.strictObject({
  rating: z
    .number({ error: "Choose a rating from 1 to 5 stars" })
    .int("Choose a rating from 1 to 5 stars")
    .min(1, "Choose a rating from 1 to 5 stars")
    .max(5, "Choose a rating from 1 to 5 stars"),
  body: z
    .string()
    .trim()
    .max(REVIEW_BODY_MAX, `Use ${REVIEW_BODY_MAX.toLocaleString("en-US")} characters or fewer`)
    .refine((v) => !CONTROL_CHARS.test(v), "Use plain text only")
    .default(""),
});

/** A review as anyone may see it. No email, no user id. */
export const reviewSchema = z.object({
  id: z.string(),
  rating: z.number().int().min(1).max(5),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** The author's display name, or "Student" when they have none. */
  reviewerName: z.string(),
  /** True when the signed-in caller wrote it. */
  mine: z.boolean(),
});

export const MODERATION_NOTE_MAX = 500;
export const REPORT_NOTE_MAX = 300;
export const APPEAL_MESSAGE_MAX = 500;
export const OTHER_NOTE_MIN = 10;

/** Why a review is reported or hidden. There is deliberately no reason about the rating. */
export const REVIEW_REASONS = ["spam", "abusive", "personal_info", "off_topic", "other"] as const;
export const reviewReasonSchema = z.enum(REVIEW_REASONS, { error: "Choose a reason" });
export type ReviewReason = z.infer<typeof reviewReasonSchema>;

const plain = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max.toLocaleString("en-US")} characters or fewer`)
    .refine((v) => !CONTROL_CHARS.test(v), "Use plain text only");

export const reportReviewRequestSchema = z.strictObject({
  reason: reviewReasonSchema,
  note: plain(REPORT_NOTE_MAX).default(""),
});

export const hideReviewRequestSchema = z
  .strictObject({
    reason: reviewReasonSchema,
    note: plain(MODERATION_NOTE_MAX).default(""),
  })
  .refine((v) => v.reason !== "other" || v.note.length >= OTHER_NOTE_MIN, {
    path: ["note"],
    message: `Add at least ${OTHER_NOTE_MIN} characters explaining the reason`,
  });

/** The note is only used when the restore settles an open appeal. */
export const restoreReviewRequestSchema = z.strictObject({
  note: plain(MODERATION_NOTE_MAX).default(""),
});

export const appealReviewRequestSchema = z.strictObject({
  message: plain(APPEAL_MESSAGE_MAX).refine((v) => v.length > 0, "Tell us why you are appealing"),
});

export const APPEAL_DECISIONS = ["uphold", "overturn"] as const;
export const decideAppealRequestSchema = z.strictObject({
  decision: z.enum(APPEAL_DECISIONS, { error: "Choose uphold or overturn" }),
  note: plain(MODERATION_NOTE_MAX).default(""),
});

export const APPEAL_STATUSES = ["open", "upheld", "overturned"] as const;
export const appealStatusSchema = z.enum(APPEAL_STATUSES);

/** What the author sees about their own hidden review. */
export const moderationStateSchema = z.object({
  state: z.literal("hidden"),
  reason: reviewReasonSchema,
  note: z.string(),
  hiddenAt: z.string(),
  canAppeal: z.boolean(),
  appeal: z
    .object({
      status: appealStatusSchema,
      message: z.string(),
      decidedNote: z.string().nullable(),
      createdAt: z.string(),
      decidedAt: z.string().nullable(),
    })
    .nullable(),
});

export const myReviewResponseSchema = z.object({
  review: reviewSchema.nullable(),
  /** Null when the review is visible (or there is none). */
  moderation: moderationStateSchema.nullable().default(null),
});

export const reportReviewResponseSchema = z.object({ reported: z.literal(true) });
export const REVIEW_QUEUE_TABS = ["reported", "hidden", "appeals"] as const;
export const staffReviewQuerySchema = z.strictObject({
  tab: z.enum(REVIEW_QUEUE_TABS).default("reported"),
  courseId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().max(512).optional(),
});

/** One row of the moderators' queue. */
export const staffReviewSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  rating: z.number().int().min(1).max(5),
  body: z.string(),
  reviewerName: z.string(),
  createdAt: z.string(),
  hidden: z.boolean(),
  hiddenAt: z.string().nullable(),
  hiddenReason: reviewReasonSchema.nullable(),
  openReportCount: z.number().int().min(0),
  openAppeal: z.boolean(),
  /** When the row last changed state for the queue: latest open report, hiding or appeal. */
  activityAt: z.string(),
});

const staffReportSchema = z.object({
  id: z.string(),
  reason: reviewReasonSchema,
  note: z.string(),
  createdAt: z.string(),
  resolved: z.boolean(),
});
const staffAppealSchema = z.object({
  id: z.string(),
  status: appealStatusSchema,
  message: z.string(),
  decidedNote: z.string().nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  hiddenAt: z.string(),
});
export const staffReviewDetailSchema = staffReviewSchema.extend({
  hiddenNote: z.string().nullable(),
  /** True when the caller is the moderator who hid it (they cannot decide its appeal). */
  hiddenByMe: z.boolean(),
  reports: z.array(staffReportSchema),
  appeals: z.array(staffAppealSchema),
});
export const staffReviewActionResponseSchema = z.object({
  review: staffReviewDetailSchema,
  changed: z.boolean(),
});
export const deleteReviewResponseSchema = z.object({ deleted: z.boolean() });

export const reviewPageQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().max(512).optional(),
});

export type CourseRating = z.infer<typeof courseRatingSchema>;
export type WriteReviewRequest = z.input<typeof writeReviewRequestSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type MyReviewResponse = z.infer<typeof myReviewResponseSchema>;
export type ReviewPageQuery = z.infer<typeof reviewPageQuerySchema>;
export type ReportReviewRequest = z.input<typeof reportReviewRequestSchema>;
export type HideReviewRequest = z.input<typeof hideReviewRequestSchema>;
export type RestoreReviewRequest = z.input<typeof restoreReviewRequestSchema>;
export type AppealReviewRequest = z.input<typeof appealReviewRequestSchema>;
export type DecideAppealRequest = z.input<typeof decideAppealRequestSchema>;
export type ModerationState = z.infer<typeof moderationStateSchema>;
export type StaffReviewQuery = z.infer<typeof staffReviewQuerySchema>;
export type StaffReview = z.infer<typeof staffReviewSchema>;
export type StaffReviewDetail = z.infer<typeof staffReviewDetailSchema>;
export type StaffReviewActionResponse = z.infer<typeof staffReviewActionResponseSchema>;
export type ReportReviewResponse = z.infer<typeof reportReviewResponseSchema>;
