import { z } from "zod";

export const CATEGORY_NAME_MIN = 2;
export const CATEGORY_NAME_MAX = 40;
export const CATEGORY_LIMIT = 50;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const name = z
  .string()
  .trim()
  .min(CATEGORY_NAME_MIN, `Use ${CATEGORY_NAME_MIN} to ${CATEGORY_NAME_MAX} characters`)
  .max(CATEGORY_NAME_MAX, `Use ${CATEGORY_NAME_MIN} to ${CATEGORY_NAME_MAX} characters`)
  .refine((v) => !CONTROL_CHARS.test(v), "Use plain text only");

export const createCategoryRequestSchema = z.strictObject({ name });
export const renameCategoryRequestSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
  name,
});

/** Anyone may list categories; `courseCount` counts published courses only. */
export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  courseCount: z.number().int().min(0),
});
export const staffCategorySchema = categorySchema.extend({
  version: z.number().int(),
  /** Every course in it, drafts included; a category is deletable only when this is 0. */
  totalCourseCount: z.number().int().min(0),
});
export const categoryListSchema = z.object({ items: z.array(categorySchema) });
export const staffCategoryListSchema = z.object({ items: z.array(staffCategorySchema) });

export type CreateCategoryRequest = z.input<typeof createCategoryRequestSchema>;
export type RenameCategoryRequest = z.input<typeof renameCategoryRequestSchema>;
export type Category = z.infer<typeof categorySchema>;
export type StaffCategory = z.infer<typeof staffCategorySchema>;
