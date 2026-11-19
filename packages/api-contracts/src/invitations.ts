import { z } from "zod";

export const INVITATION_TTL_HOURS = 168;
export const INVITATION_STATUSES = ["pending", "accepted", "revoked", "expired"] as const;
export const invitationStatusSchema = z.enum(INVITATION_STATUSES);

export const INVITATION_ERROR_CODES = {
  invalid: "INVITATION_INVALID",
  pending: "INVITATION_PENDING",
  alreadyStaff: "ALREADY_STAFF",
} as const;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Enter the person's email")
  .max(254, "That email is too long")
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address");

export const createInvitationRequestSchema = z.strictObject({ email });

export const acceptInvitationRequestSchema = z.strictObject({
  token: z.string().min(16, "Paste the whole invitation code").max(200),
  displayName: z.string().trim().min(2, "Enter your name").max(80, "Use 80 characters or fewer"),
  password: z.string().min(1, "Enter a password").max(200),
});

export const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  status: invitationStatusSchema,
  invitedByName: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  /** Only on the answer to creating or resending: how the invitation reaches the person. */
  delivery: z.enum(["email"]).optional(),
});
export const invitationPageSchema = z.object({
  items: z.array(invitationSchema),
  nextCursor: z.string().nullable(),
});
export const invitationQuerySchema = z.strictObject({
  status: invitationStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(512).optional(),
});

export const instructorSummarySchema = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  since: z.string(),
  courseCount: z.number().int(),
});
export const instructorListSchema = z.object({ items: z.array(instructorSummarySchema) });
export const deactivateInstructorRequestSchema = z.strictObject({
  reason: z.string().trim().min(3, "Use 3 to 300 characters").max(300, "Use 3 to 300 characters"),
});
export const deactivateInstructorResponseSchema = z.object({
  userId: z.string(),
  grantsEnded: z.number().int(),
  sessionsEnded: z.number().int(),
  /** Courses stay published and keep the instructor's name; staff manage them from here on. */
  coursesKept: z.number().int(),
});

export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
export type InvitationQuery = z.infer<typeof invitationQuerySchema>;
export type InstructorSummary = z.infer<typeof instructorSummarySchema>;
export type DeactivateInstructorResponse = z.infer<typeof deactivateInstructorResponseSchema>;
