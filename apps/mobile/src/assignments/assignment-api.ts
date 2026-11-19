import {
  assignResultSchema,
  attachmentLinkSchema,
  enrolledStudentListSchema,
  myAssignmentDetailSchema,
  myAssignmentListSchema,
  recipientListSchema,
  staffAssignmentListSchema,
  staffAssignmentSchema,
  staffSubmissionSchema,
  submissionSchema,
  type AssignResult,
  type AttachmentLink,
  type CreateAssignmentRequest,
  type EnrolledStudent,
  type MyAssignment,
  type MyAssignmentDetail,
  type Recipient,
  type StaffAssignment,
  type StaffSubmission,
  type Submission,
  type UpdateAssignmentRequest,
} from "@chartnexa/api-contracts";
import { z } from "zod";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "../auth/authed-fetch";

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}
const enc = encodeURIComponent;
const staff = (courseId: string) => `/staff/courses/${enc(courseId)}`;

/** The student's side. The server decides what each person may see. */
export const assignmentApi = {
  async list(): Promise<MyAssignment[]> {
    return check(myAssignmentListSchema, await authedFetch("/me/assignments")).items;
  },
  async get(id: string): Promise<MyAssignmentDetail> {
    return check(myAssignmentDetailSchema, await authedFetch(`/me/assignments/${enc(id)}`));
  },
  async submit(id: string, body: string): Promise<Submission> {
    return check(
      submissionSchema,
      await authedFetch(`/me/assignments/${enc(id)}/submission`, { method: "PUT", body: { body } }),
    );
  },
  async attachmentLink(id: string): Promise<AttachmentLink> {
    return check(
      attachmentLinkSchema,
      await authedFetch(`/me/assignments/${enc(id)}/attachment-link`, { method: "POST" }),
    );
  },
};

/** Staff calls, for people holding assignments:manage on the course. */
export const staffAssignmentApi = {
  async list(courseId: string): Promise<StaffAssignment[]> {
    return check(staffAssignmentListSchema, await authedFetch(`${staff(courseId)}/assignments`))
      .items;
  },
  async get(courseId: string, id: string): Promise<StaffAssignment> {
    return check(
      staffAssignmentSchema,
      await authedFetch(`${staff(courseId)}/assignments/${enc(id)}`),
    );
  },
  async create(courseId: string, body: CreateAssignmentRequest): Promise<StaffAssignment> {
    return check(
      staffAssignmentSchema,
      await authedFetch(`${staff(courseId)}/assignments`, { method: "POST", body }),
    );
  },
  async update(
    courseId: string,
    id: string,
    body: UpdateAssignmentRequest,
  ): Promise<StaffAssignment> {
    return check(
      staffAssignmentSchema,
      await authedFetch(`${staff(courseId)}/assignments/${enc(id)}`, { method: "PATCH", body }),
    );
  },
  async setAttachment(
    courseId: string,
    id: string,
    name: string,
    bytes: Uint8Array,
  ): Promise<StaffAssignment> {
    return check(
      staffAssignmentSchema,
      await authedFetch(`${staff(courseId)}/assignments/${enc(id)}/attachment?name=${enc(name)}`, {
        method: "PUT",
        rawBody: bytes,
        timeoutMs: 60_000,
      }),
    );
  },
  async removeAttachment(courseId: string, id: string): Promise<StaffAssignment> {
    return check(
      staffAssignmentSchema,
      await authedFetch(`${staff(courseId)}/assignments/${enc(id)}/attachment`, {
        method: "DELETE",
      }),
    );
  },
  async attachmentLink(courseId: string, id: string): Promise<AttachmentLink> {
    return check(
      attachmentLinkSchema,
      await authedFetch(`${staff(courseId)}/assignments/${enc(id)}/attachment-link`, {
        method: "POST",
      }),
    );
  },
  async enrolled(courseId: string): Promise<EnrolledStudent[]> {
    return check(
      enrolledStudentListSchema,
      await authedFetch(`${staff(courseId)}/enrolled-students`),
    ).items;
  },
  async assign(
    courseId: string,
    id: string,
    body: { all?: boolean; userIds?: string[] },
  ): Promise<AssignResult> {
    return check(
      assignResultSchema,
      await authedFetch(`${staff(courseId)}/assignments/${enc(id)}/assign`, {
        method: "POST",
        body,
      }),
    );
  },
  async recipients(courseId: string, id: string): Promise<Recipient[]> {
    return check(
      recipientListSchema,
      await authedFetch(`${staff(courseId)}/assignments/${enc(id)}/recipients`),
    ).items;
  },
  async submission(courseId: string, id: string, userId: string): Promise<StaffSubmission> {
    return check(
      staffSubmissionSchema,
      await authedFetch(`${staff(courseId)}/assignments/${enc(id)}/submissions/${enc(userId)}`),
    );
  },
  async feedback(
    courseId: string,
    id: string,
    userId: string,
    feedback: string,
  ): Promise<StaffSubmission> {
    return check(
      staffSubmissionSchema,
      await authedFetch(
        `${staff(courseId)}/assignments/${enc(id)}/submissions/${enc(userId)}/feedback`,
        { method: "PUT", body: { feedback } },
      ),
    );
  },
};

export const STATE_TEXT: Record<MyAssignment["state"], string> = {
  to_do: "To do",
  submitted: "Handed in",
  late: "Handed in late",
  reviewed: "Reviewed",
};

export const RECIPIENT_TEXT: Record<Recipient["state"], string> = {
  not_started: "Not started",
  submitted: "Handed in",
  late: "Handed in late",
  reviewed: "Reviewed",
};
