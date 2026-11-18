import { z } from "zod";
import { MAX_PAGE_SIZE } from "./pagination.js";
import { courseLevelSchema, courseToneSchema } from "./courses.js";
import { courseProgressSchema } from "./progress.js";

export const ENTITLEMENT_SOURCES = ["admin_grant"] as const;
export const ENTITLEMENT_STATUSES = ["active", "revoked"] as const;
export const ENTITLEMENT_REASON_MIN = 3;
export const ENTITLEMENT_REASON_MAX = 200;

const reason = z
  .string()
  .trim()
  .min(ENTITLEMENT_REASON_MIN, `Use at least ${ENTITLEMENT_REASON_MIN} characters`)
  .max(ENTITLEMENT_REASON_MAX, `Use at most ${ENTITLEMENT_REASON_MAX} characters`);

export const grantEntitlementRequestSchema = z.strictObject({ userId: z.uuid(), reason });
export const revokeEntitlementRequestSchema = z.strictObject({ reason });

export const entitlementSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  userId: z.string(),
  source: z.enum(ENTITLEMENT_SOURCES),
  status: z.enum(ENTITLEMENT_STATUSES),
  grantReason: z.string(),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
});

/** `created` is false when the person already had access (nothing changed). */
export const grantEntitlementResponseSchema = z.object({
  created: z.boolean(),
  entitlement: entitlementSchema,
});

/** What staff see in a course's list of people with access. Never put this in audit rows or logs. */
export const courseStudentSchema = z.object({
  id: z.string(),
  user: z.object({
    id: z.string(),
    displayName: z.string().nullable(),
    email: z.string().nullable(),
  }),
  source: z.enum(ENTITLEMENT_SOURCES),
  grantReason: z.string(),
  createdAt: z.string(),
});

/** A course the signed-in person owns, with public course fields only. */
export const myCourseSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  level: courseLevelSchema,
  priceCents: z.number().int(),
  currency: z.literal("USD"),
  coverTone: courseToneSchema,
  /** False when the course is unpublished: owners keep access but it is not for sale. */
  onSale: z.boolean(),
  /** When access began. */
  enrolledAt: z.string(),
  /** Lessons complete out of lessons in the course now. */
  progress: courseProgressSchema.default({ completed: 0, total: 0 }),
});

export const entitlementPageQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().max(512).optional(),
});

export type GrantEntitlementRequest = z.infer<typeof grantEntitlementRequestSchema>;
export type RevokeEntitlementRequest = z.infer<typeof revokeEntitlementRequestSchema>;
export type Entitlement = z.infer<typeof entitlementSchema>;
export type GrantEntitlementResponse = z.infer<typeof grantEntitlementResponseSchema>;
export type CourseStudent = z.infer<typeof courseStudentSchema>;
export type MyCourse = z.infer<typeof myCourseSchema>;
export type EntitlementPageQuery = z.infer<typeof entitlementPageQuerySchema>;
