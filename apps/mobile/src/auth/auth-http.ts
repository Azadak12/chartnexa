import {
  tokenPairSchema,
  type ForgotPasswordRequest,
  type LoginRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
  type TokenPair,
} from "@chartnexa/api-contracts";
import { apiFetch } from "../api/client";
import { AppError, messageFor } from "../api/errors";

/** Calls that need no sign-in. Responses are checked against the shared contract. */
function parsePair(body: unknown): TokenPair {
  const parsed = tokenPairSchema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}

export const authHttp = {
  /** The server answers the same way whether or not the email already exists. */
  async register(body: RegisterRequest): Promise<void> {
    await apiFetch("/auth/register", { method: "POST", body: { mail: body.email, password: body.password } });
  },

  async login(body: LoginRequest): Promise<TokenPair> {
    return parsePair(await apiFetch("/auth/login", { method: "POST", body }));
  },

  async refresh(refreshToken: string): Promise<TokenPair> {
    return parsePair(await apiFetch("/auth/refresh", { method: "POST", body: { refreshToken } }));
  },

  async verifyEmail(token: string): Promise<void> {
    await apiFetch("/auth/email/verify", { method: "POST", body: { token } });
  },

  async forgotPassword(body: ForgotPasswordRequest): Promise<void> {
    await apiFetch("/auth/password/forgot", { method: "POST", body });
  },

  async resetPassword(body: ResetPasswordRequest): Promise<void> {
    await apiFetch("/auth/password/reset", { method: "POST", body });
  },

  /** Best-effort end of the server session, using the token that was current at sign-out. */
  async logout(accessToken: string, timeoutMs = 5000): Promise<void> {
    await apiFetch("/auth/logout", { method: "POST", getToken: () => accessToken, timeoutMs });
  },
};
