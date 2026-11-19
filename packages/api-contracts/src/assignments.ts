import { z } from "zod";

export const ASSIGNMENT_TITLE_MIN = 3;
export const ASSIGNMENT_TITLE_MAX = 120;
export const ASSIGNMENT_INSTRUCTIONS_MAX = 4000;
export const SUBMISSION_MAX = 5000;
export const FEEDBACK_MAX = 2000;
export const ASSIGNMENT_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;
export const MAX_ASSIGN_AT_ONCE = 500;

export const ASSIGNMENT_ERROR_CODES = {
  notPublished: "ASSIGNMENT_NOT_PUBLISHED",
  locked: "SUBMISSION_LOCKED",
  notEnrolled: "NOT_ENROLLED",
  inUse: "ASSIGNMENT_IN_USE",
} as const;

const title = z
  .string()
  .trim()
  .min(ASSIGNMENT_TITLE_MIN, `Use ${ASSIGNMENT_TITLE_MIN} to ${ASSIGNMENT_TITLE_MAX} characters`)
  .max(ASSIGNMENT_TITLE_MAX, `Use ${ASSIGNMENT_TITLE_MIN} to ${ASSIGNMENT_TITLE_MAX} characters`);
const instructions = z
  .string()
  .trim()
  .min(1, "Write the instructions")
  .max(ASSIGNMENT_INSTRUCTIONS_MAX, `Use at most ${ASSIGNMENT_INSTRUCTIONS_MAX} characters`);
const dueAt = z.iso.datetime({ offset: true, error: "Use a date and time with a time zone" });
const assignmentStatus = z.enum(["draft", "published"]);

export const createAssignmentRequestSchema = z.strictObject({
  title,
  instructions,
  lessonId: z.uuid().nullable().optional(),
  dueAt: dueAt.nullable().optional(),
  status: assignmentStatus.optional(),
});
export const updateAssignmentRequestSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
  title: title.optional(),
  instructions: instructions.optional(),
  lessonId: z.uuid().nullable().optional(),
  dueAt: dueAt.nullable().optional(),
  status: assignmentStatus.optional(),
});
export const assignRequestSchema = z.strictObject({
  /** Everyone with active access to the course now. */
  all: z.boolean().optional(),
  userIds: z.array(z.uuid()).max(MAX_ASSIGN_AT_ONCE).optional(),
});
export const submissionRequestSchema = z.strictObject({
  body: z
    .string()
    .trim()
    .min(1, "Write your answer")
    .max(SUBMISSION_MAX, `Use at most ${SUBMISSION_MAX} characters`),
});
export const feedbackRequestSchema = z.strictObject({
  feedback: z
    .string()
    .trim()
    .min(1, "Write your feedback")
    .max(FEEDBACK_MAX, `Use at most ${FEEDBACK_MAX} characters`),
});

const attachmentSchema = z
  .object({ name: z.string(), mimeType: z.string(), sizeBytes: z.number().int() })
  .nullable();

export const staffAssignmentSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  lessonId: z.string().nullable(),
  lessonTitle: z.string().nullable(),
  title: z.string(),
  instructions: z.string(),
  dueAt: z.string().nullable(),
  status: assignmentStatus,
  version: z.number().int(),
  attachment: attachmentSchema,
  createdAt: z.string(),
  assignedCount: z.number().int(),
  submittedCount: z.number().int(),
  reviewedCount: z.number().int(),
});
export const staffAssignmentListSchema = z.object({ items: z.array(staffAssignmentSchema) });

export const recipientSchema = z.object({
  userId: z.string(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  assignedAt: z.string(),
  state: z.enum(["not_started", "submitted", "late", "reviewed"]),
  submittedAt: z.string().nullable(),
});
export const recipientListSchema = z.object({ items: z.array(recipientSchema) });
export const enrolledStudentSchema = z.object({
  userId: z.string(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
});
export const enrolledStudentListSchema = z.object({ items: z.array(enrolledStudentSchema) });
export const assignResultSchema = z.object({
  assigned: z.number().int(),
  alreadyAssigned: z.number().int(),
});

export const submissionSchema = z.object({
  body: z.string(),
  status: z.enum(["submitted", "reviewed"]),
  late: z.boolean(),
  submittedAt: z.string(),
  feedback: z.string().nullable(),
  reviewedAt: z.string().nullable(),
});
export const staffSubmissionSchema = submissionSchema.extend({
  userId: z.string(),
  displayName: z.string().nullable(),
});

/** What a student sees in a list. */
export const myAssignmentSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  title: z.string(),
  dueAt: z.string().nullable(),
  state: z.enum(["to_do", "submitted", "late", "reviewed"]),
  overdue: z.boolean(),
  assignedAt: z.string(),
});
export const myAssignmentListSchema = z.object({ items: z.array(myAssignmentSchema) });
export const myAssignmentDetailSchema = myAssignmentSchema.extend({
  instructions: z.string(),
  lessonId: z.string().nullable(),
  attachment: attachmentSchema,
  submission: submissionSchema.nullable(),
});
export const attachmentLinkSchema = z.object({ url: z.string(), expiresAt: z.string() });

export type CreateAssignmentRequest = z.infer<typeof createAssignmentRequestSchema>;
export type UpdateAssignmentRequest = z.infer<typeof updateAssignmentRequestSchema>;
export type AssignRequest = z.infer<typeof assignRequestSchema>;
export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;
export type StaffAssignment = z.infer<typeof staffAssignmentSchema>;
export type Recipient = z.infer<typeof recipientSchema>;
export type EnrolledStudent = z.infer<typeof enrolledStudentSchema>;
export type AssignResult = z.infer<typeof assignResultSchema>;
export type Submission = z.infer<typeof submissionSchema>;
export type StaffSubmission = z.infer<typeof staffSubmissionSchema>;
export type MyAssignment = z.infer<typeof myAssignmentSchema>;
export type MyAssignmentDetail = z.infer<typeof myAssignmentDetailSchema>;
export type AttachmentLink = z.infer<typeof attachmentLinkSchema>;
