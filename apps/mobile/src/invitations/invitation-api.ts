import {
  deactivateInstructorResponseSchema,
  instructorListSchema,
  invitationPageSchema,
  invitationSchema,
  type DeactivateInstructorResponse,
  type InstructorSummary,
  type Invitation,
  type InvitationStatus,
} from "@chartnexa/api-contracts";
import { z } from "zod";
import { apiFetch } from "../api/client";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "../auth/authed-fetch";

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}
const enc = encodeURIComponent;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const invitationApi = {
  async list(status: InvitationStatus | undefined, cursor?: string): Promise<Page<Invitation>> {
    const q = [status ? `status=${status}` : "", cursor ? `cursor=${enc(cursor)}` : ""]
      .filter(Boolean)
      .join("&");
    return check(
      invitationPageSchema,
      await authedFetch(`/staff/instructor-invitations${q ? `?${q}` : ""}`),
    );
  },
  async invite(email: string): Promise<Invitation> {
    return check(
      invitationSchema,
      await authedFetch("/staff/instructor-invitations", { method: "POST", body: { email } }),
    );
  },
  async resend(id: string): Promise<Invitation> {
    return check(
      invitationSchema,
      await authedFetch(`/staff/instructor-invitations/${enc(id)}/resend`, { method: "POST" }),
    );
  },
  async revoke(id: string): Promise<Invitation> {
    return check(
      invitationSchema,
      await authedFetch(`/staff/instructor-invitations/${enc(id)}`, { method: "DELETE" }),
    );
  },
  async instructors(): Promise<InstructorSummary[]> {
    return check(instructorListSchema, await authedFetch("/staff/instructors")).items;
  },
  async deactivate(userId: string, reason: string): Promise<DeactivateInstructorResponse> {
    return check(
      deactivateInstructorResponseSchema,
      await authedFetch(`/staff/instructors/${enc(userId)}/deactivate`, {
        method: "POST",
        body: { reason },
      }),
    );
  },
  /** Public: the emailed code is the permission. */
  async accept(body: { token: string; displayName: string; password: string }): Promise<void> {
    await apiFetch("/auth/instructor-invitations/accept", { method: "POST", body });
  },
};

export const STATUS_TEXT: Record<InvitationStatus, string> = {
  pending: "Open",
  accepted: "Accepted",
  revoked: "Revoked",
  expired: "Expired",
};
