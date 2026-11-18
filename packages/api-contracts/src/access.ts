import { z } from "zod";

export const STAFF_ROLE_VALUES = ["instructor", "manager", "admin"] as const;
export const staffRoleSchema = z.enum(STAFF_ROLE_VALUES);
export type StaffRoleValue = z.infer<typeof staffRoleSchema>;

export const REASON_MIN = 3;
export const REASON_MAX = 200;
const reason = z.string().trim().min(REASON_MIN).max(REASON_MAX);

export const assignRoleRequestSchema = z.strictObject({ role: staffRoleSchema, reason });
export const revokeRoleRequestSchema = z.strictObject({ reason });
export const lookupQuerySchema = z.strictObject({
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email())
    .transform((v) => v.toLowerCase()),
});

export const accessResponseSchema = z.object({
  roles: z.array(z.enum(["student", ...STAFF_ROLE_VALUES])),
  permissions: z.array(z.string()),
  /** Course-specific grants of an Instructor. Informational; older servers omit it. */
  courseGrants: z
    .array(z.object({ courseId: z.string(), permissions: z.array(z.string()) }))
    .default([]),
});
export const userLookupResponseSchema = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  staffRole: staffRoleSchema.nullable(),
  status: z.enum(["active", "disabled", "deleted"]),
});
export const roleChangeResponseSchema = z.object({
  userId: z.string(),
  staffRole: staffRoleSchema.nullable(),
});

export const AUDIT_OUTCOMES = ["success", "denied"] as const;
export const auditEventSchema = z.object({
  id: z.string(),
  occurredAt: z.string(),
  actorKind: z.enum(["user", "system"]),
  actorUserId: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  outcome: z.enum(AUDIT_OUTCOMES),
  reason: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  requestId: z.string().nullable(),
});

export type AssignRoleRequest = z.infer<typeof assignRoleRequestSchema>;
export type RevokeRoleRequest = z.infer<typeof revokeRoleRequestSchema>;
export type LookupQuery = z.infer<typeof lookupQuerySchema>;
export type AccessResponse = z.infer<typeof accessResponseSchema>;
export type UserLookupResponse = z.infer<typeof userLookupResponseSchema>;
export type RoleChangeResponse = z.infer<typeof roleChangeResponseSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
