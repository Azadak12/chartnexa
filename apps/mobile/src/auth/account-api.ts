import {
  meResponseSchema,
  sessionSummarySchema,
  type ChangePasswordRequest,
  type DeleteAccountRequest,
  type MeResponse,
  type SessionSummary,
  type UpdateProfileRequest,
} from "@chartnexa/api-contracts";
import { z } from "zod";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "./authed-fetch";

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}

/** Calls that need a signed-in person. */
export const accountApi = {
  async me(): Promise<MeResponse> {
    return check(meResponseSchema, await authedFetch("/me"));
  },

  async updateProfile(body: UpdateProfileRequest): Promise<MeResponse> {
    return check(meResponseSchema, await authedFetch("/me", { method: "PATCH", body }));
  },

  async changePassword(body: ChangePasswordRequest): Promise<void> {
    await authedFetch("/me/password", { method: "POST", body });
  },

  async deleteAccount(body: DeleteAccountRequest): Promise<void> {
    await authedFetch("/me", { method: "DELETE", body });
  },

  async resendVerification(): Promise<void> {
    await authedFetch("/auth/email/resend", { method: "POST" });
  },

  async listSessions(): Promise<SessionSummary[]> {
    return check(z.array(sessionSummarySchema), await authedFetch("/me/sessions"));
  },

  async revokeSession(id: string): Promise<void> {
    await authedFetch(`/me/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async logoutEverywhere(): Promise<void> {
    await authedFetch("/auth/logout-all", { method: "POST" });
  },
};
