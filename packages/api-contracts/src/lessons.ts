import { z } from "zod";

export const LESSON_TITLE_MAX = 120;
export const LESSON_BODY_MAX = 20_000;
export const MAX_LESSONS_PER_COURSE = 200;

/** Stable machine codes the app can react to (the envelope `code`). */
export const LESSON_ERROR_CODES = {
  enrollmentRequired: "ENROLLMENT_REQUIRED",
  limitReached: "LESSON_LIMIT_REACHED",
  orderChanged: "LESSON_ORDER_CHANGED",
} as const;

// Plain text only: newlines and tabs are allowed, other control characters are not.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const title = z
  .string()
  .trim()
  .min(1, "Add a title.")
  .max(LESSON_TITLE_MAX, `Use ${LESSON_TITLE_MAX} characters or fewer.`)
  .refine((v) => !CONTROL_CHARS.test(v) && !/[\r\n\t]/.test(v), "Use plain text only.");

const body = z
  .string()
  .max(LESSON_BODY_MAX, `Use ${LESSON_BODY_MAX.toLocaleString("en-US")} characters or fewer.`)
  .refine((v) => !CONTROL_CHARS.test(v), "Use plain text only.");

/** A client-made random string; sending the same one again returns the lesson already created. */
export const idempotencyKeySchema = z.string().min(8).max(100);

export const createLessonRequestSchema = z.strictObject({
  title,
  body: body.default(""),
  isPreview: z.boolean().default(false),
  idempotencyKey: idempotencyKeySchema,
});

/** `expectedVersion` is the version the editor started from; a newer lesson refuses the edit. */
export const updateLessonRequestSchema = z
  .strictObject({
    expectedVersion: z.number().int().min(1),
    title: title.optional(),
    body: body.optional(),
    isPreview: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "expectedVersion"), {
    message: "Provide at least one field to change",
    path: ["title"],
  });

/** The full ordered list of the course's lesson ids; it must match the course's lessons exactly. */
export const reorderLessonsRequestSchema = z.strictObject({
  lessonIds: z
    .array(z.uuid())
    .min(1)
    .max(MAX_LESSONS_PER_COURSE)
    .refine((ids) => new Set(ids).size === ids.length, "Each lesson can appear once."),
});

export const staffLessonSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  title: z.string(),
  body: z.string(),
  position: z.number().int(),
  isPreview: z.boolean(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Staff list: lessons in order, with bodies. */
export const staffLessonListSchema = z.object({ items: z.array(staffLessonSchema) });

/** What anyone may see of every lesson of a published course: no body. */
export const lessonOutlineItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  position: z.number().int(),
  isPreview: z.boolean(),
});
export const lessonOutlineSchema = z.object({ items: z.array(lessonOutlineItemSchema) });

/** A lesson anyone may read (free preview only). */
export const publicLessonSchema = lessonOutlineItemSchema.extend({ body: z.string() });

export type CreateLessonRequest = z.input<typeof createLessonRequestSchema>;
export type UpdateLessonRequest = z.input<typeof updateLessonRequestSchema>;
export type ReorderLessonsRequest = z.infer<typeof reorderLessonsRequestSchema>;
export type StaffLesson = z.infer<typeof staffLessonSchema>;
export type StaffLessonList = z.infer<typeof staffLessonListSchema>;
export type LessonOutlineItem = z.infer<typeof lessonOutlineItemSchema>;
export type LessonOutline = z.infer<typeof lessonOutlineSchema>;
export type PublicLesson = z.infer<typeof publicLessonSchema>;
