import { z } from "zod";
import { tokenPairSchema } from "./auth.js";

/** What sign-in answers instead of tokens when a second step is needed. */
export const MFA_CHALLENGE_STATUSES = ["mfa_required", "mfa_setup_required"] as const;
export const mfaChallengeSchema = z.object({
  status: z.enum(MFA_CHALLENGE_STATUSES),
  challengeToken: z.string(),
  expiresInSeconds: z.number().int(),
});

/** Sign-in answers with tokens (everyone else) or a challenge (Admins and Managers). */
export const loginResponseSchema = z.union([tokenPairSchema, mfaChallengeSchema]);

const challengeToken = z.string().min(16).max(256);
/** A 6-digit code or a recovery code, typed with or without spaces and hyphens. */
export const mfaCodeSchema = z
  .string()
  .trim()
  .min(6)
  .max(24)
  .regex(/^[0-9A-Za-z \-]+$/, "Use only letters, numbers, spaces and hyphens");
const totpCode = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Enter the 6 digits from your authenticator app"));

export const verifyMfaRequestSchema = z.strictObject({ challengeToken, code: mfaCodeSchema });
export const startMfaSetupRequestSchema = z.strictObject({ challengeToken });
export const completeMfaSetupRequestSchema = z.strictObject({ challengeToken, code: totpCode });
export const regenerateRecoveryCodesRequestSchema = z.strictObject({
  password: z.string().min(1).max(128),
  code: totpCode,
});
export const resetMfaRequestSchema = z.strictObject({
  reason: z.string().trim().min(3).max(200),
});

/** Signed in through the second step. `recoveryCodesRemaining` is set only when a recovery code was used. */
export const mfaSignInResponseSchema = tokenPairSchema.extend({
  recoveryCodesRemaining: z.number().int().min(0).nullable().default(null),
});
export const mfaSetupStartResponseSchema = z.object({
  /** The key to type into an authenticator app, in base32. Shown once. */
  secret: z.string(),
  /** The `otpauth://` link that authenticator apps open. */
  otpauthUri: z.string(),
  accountName: z.string(),
});
/** Recovery codes are shown once, 10 of them, as `xxxx-xxxx-xxxx`. */
export const recoveryCodesSchema = z.array(z.string()).length(10);
export const mfaSetupCompleteResponseSchema = tokenPairSchema.extend({
  recoveryCodes: recoveryCodesSchema,
});
export const regenerateRecoveryCodesResponseSchema = z.object({
  recoveryCodes: recoveryCodesSchema,
});
export const mfaStatusSchema = z.object({
  /** True for Admins and Managers. */
  required: z.boolean(),
  enabled: z.boolean(),
  recoveryCodesRemaining: z.number().int().min(0),
});
export const resetMfaResponseSchema = z.object({ reset: z.boolean() });

export type MfaChallenge = z.infer<typeof mfaChallengeSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type VerifyMfaRequest = z.infer<typeof verifyMfaRequestSchema>;
export type StartMfaSetupRequest = z.infer<typeof startMfaSetupRequestSchema>;
export type CompleteMfaSetupRequest = z.infer<typeof completeMfaSetupRequestSchema>;
export type RegenerateRecoveryCodesRequest = z.infer<typeof regenerateRecoveryCodesRequestSchema>;
export type ResetMfaRequest = z.infer<typeof resetMfaRequestSchema>;
export type MfaSignInResponse = z.infer<typeof mfaSignInResponseSchema>;
export type MfaSetupStartResponse = z.infer<typeof mfaSetupStartResponseSchema>;
export type MfaSetupCompleteResponse = z.infer<typeof mfaSetupCompleteResponseSchema>;
export type MfaStatus = z.infer<typeof mfaStatusSchema>;
