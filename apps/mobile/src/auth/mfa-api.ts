import {
  mfaStatusSchema,
  regenerateRecoveryCodesResponseSchema,
  type MfaStatus,
} from "@chartnexa/api-contracts";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "./authed-fetch";

/** The signed-in person's own two-step settings. */
export const mfaApi = {
  async status(): Promise<MfaStatus> {
    const parsed = mfaStatusSchema.safeParse(await authedFetch("/me/mfa"));
    if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
    return parsed.data;
  },
  async regenerate(body: { password: string; code: string }): Promise<string[]> {
    const parsed = regenerateRecoveryCodesResponseSchema.safeParse(
      await authedFetch("/me/mfa/recovery-codes", { method: "POST", body }),
    );
    if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
    return parsed.data.recoveryCodes;
  },
};
