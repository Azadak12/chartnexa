import { z } from "zod";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

const email = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((v) => v.toLowerCase());
const newPassword = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);
// Login and confirmation passwords are not policy-checked, only bounded so hashing cannot be abused.
const existingPassword = z.string().min(1).max(PASSWORD_MAX);
const token = z.string().min(16).max(256);
const deviceLabel = z.string().trim().min(1).max(80).optional();

export const registerRequestSchema = z.strictObject({
  email,
  password: newPassword,
  displayName: z.string().trim().min(1).max(80).optional(),
});
export const loginRequestSchema = z.strictObject({
  email,
  password: existingPassword,
  deviceLabel,
});
export const refreshRequestSchema = z.strictObject({ refreshToken: token });
export const verifyEmailRequestSchema = z.strictObject({ token });
export const forgotPasswordRequestSchema = z.strictObject({ email });
export const resetPasswordRequestSchema = z.strictObject({ token, newPassword });
export const changePasswordRequestSchema = z.strictObject({
  currentPassword: existingPassword,
  newPassword,
});
export const deleteAccountRequestSchema = z.strictObject({ password: existingPassword });
export const updateProfileRequestSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(80),
});

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  sessionId: z.string(),
  expiresIn: z.number().int(),
});
export const meResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});
export const sessionSummarySchema = z.object({
  id: z.string(),
  deviceLabel: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  current: z.boolean(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type TokenPair = z.infer<typeof tokenPairSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
