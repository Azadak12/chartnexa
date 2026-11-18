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

export const myReviewResponseSchema = z.object({ review: reviewSchema.nullable() });
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
