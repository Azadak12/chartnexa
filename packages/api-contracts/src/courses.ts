import { z } from "zod";
import { MAX_PAGE_SIZE } from "./pagination.js";

export const COURSE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const COURSE_TONES = ["blue", "black", "tint"] as const;
export const COURSE_STATUSES = ["draft", "published"] as const;

export const courseLevelSchema = z.enum(COURSE_LEVELS);
export const courseToneSchema = z.enum(COURSE_TONES);
export const courseStatusSchema = z.enum(COURSE_STATUSES);

export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 5000;
/** US cents: $0.00 (free) to $10,000.00. */
export const PRICE_MAX_CENTS = 1_000_000;

const title = z.string().trim().min(TITLE_MIN).max(TITLE_MAX);
const description = z.string().trim().max(DESCRIPTION_MAX);
const priceCents = z.number().int().min(0).max(PRICE_MAX_CENTS);

export const createCourseRequestSchema = z.strictObject({
  title,
  description: description.default(""),
  level: courseLevelSchema,
  priceCents,
  coverTone: courseToneSchema.default("blue"),
});

/** `expectedVersion` is the version the editor started from; a newer course refuses the edit. */
export const updateCourseRequestSchema = z
  .strictObject({
    expectedVersion: z.number().int().min(1),
    title: title.optional(),
    description: description.optional(),
    level: courseLevelSchema.optional(),
    priceCents: priceCents.optional(),
    coverTone: courseToneSchema.optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "expectedVersion"), {
    message: "Provide at least one field to change",
    path: ["title"],
  });

/** What anyone may see of a published course. No staff-only fields. */
export const publicCourseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  level: courseLevelSchema,
  priceCents: z.number().int(),
  currency: z.literal("USD"),
  coverTone: courseToneSchema,
  publishedAt: z.string(),
});

export const publicCourseSummarySchema = publicCourseSchema.omit({ description: true }).extend({
  /** First part of the description for cards. */
  summary: z.string(),
});

export const staffCourseSchema = publicCourseSchema.omit({ publishedAt: true }).extend({
  status: courseStatusSchema,
  version: z.number().int(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const catalogQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  level: courseLevelSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().max(512).optional(),
});

export const staffCourseQuerySchema = z.strictObject({
  status: courseStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().max(512).optional(),
});

export type CourseLevel = z.infer<typeof courseLevelSchema>;
export type CourseTone = z.infer<typeof courseToneSchema>;
export type CourseStatus = z.infer<typeof courseStatusSchema>;
export type CreateCourseRequest = z.input<typeof createCourseRequestSchema>;
export type UpdateCourseRequest = z.input<typeof updateCourseRequestSchema>;
export type PublicCourse = z.infer<typeof publicCourseSchema>;
export type PublicCourseSummary = z.infer<typeof publicCourseSummarySchema>;
export type StaffCourse = z.infer<typeof staffCourseSchema>;
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export type StaffCourseQuery = z.infer<typeof staffCourseQuerySchema>;
