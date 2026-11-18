import {
  grantResponseSchema,
  instructorPermissionsResponseSchema,
  roleChangeResponseSchema,
  userLookupResponseSchema,
  type GrantRequest,
  type GrantResponse,
  type InstructorPermissionsResponse,
  type RoleChangeResponse,
  type UserLookupResponse,
} from "@chartnexa/api-contracts";
import type { z } from "zod";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "../auth/authed-fetch";

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}

const enc = encodeURIComponent;

/** Staff calls about Instructors. The server decides who may do each one. */
export const instructorApi = {
  async lookup(email: string): Promise<UserLookupResponse> {
    return check(
      userLookupResponseSchema,
      await authedFetch(`/staff/users/lookup?email=${enc(email)}`),
    );
  },
  async permissions(userId: string): Promise<InstructorPermissionsResponse> {
    return check(
      instructorPermissionsResponseSchema,
      await authedFetch(`/staff/instructors/${enc(userId)}/permissions`),
    );
  },
  async grant(userId: string, body: GrantRequest): Promise<GrantResponse> {
    return check(
      grantResponseSchema,
      await authedFetch(`/staff/instructors/${enc(userId)}/grants`, { method: "POST", body }),
    );
  },
  async revokeGrant(userId: string, grantId: string, reason: string): Promise<void> {
    await authedFetch(`/staff/instructors/${enc(userId)}/grants/${enc(grantId)}/revoke`, {
      method: "POST",
      body: { reason },
    });
  },
  async makeInstructor(userId: string, reason: string): Promise<RoleChangeResponse> {
    return check(
      roleChangeResponseSchema,
      await authedFetch(`/staff/users/${enc(userId)}/role`, {
        method: "PUT",
        body: { role: "instructor", reason },
      }),
    );
  },
  async removeInstructorRole(userId: string, reason: string): Promise<RoleChangeResponse> {
    return check(
      roleChangeResponseSchema,
      await authedFetch(`/staff/users/${enc(userId)}/role/revoke`, {
        method: "POST",
        body: { reason },
      }),
    );
  },
};
