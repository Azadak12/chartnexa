import type { FieldValues, UseFormSetError } from "react-hook-form";
import { z } from "zod";
import {
  forgotPasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  changePasswordRequestSchema,
  deleteAccountRequestSchema,
  updateProfileRequestSchema,
  verifyEmailRequestSchema,
} from "@chartnexa/api-contracts";
import { AppError } from "../api/errors";

/** Shows each server field error beside its field and focuses the first one. */
export function applyServerErrors(
  error: unknown,
  setError: UseFormSetError<FieldValues>,
  known: string[],
): boolean {
  if (!(error instanceof AppError) || error.fields.length === 0) return false;
  let applied = false;
  for (const f of error.fields) {
    if (known.includes(f.field)) {
      setError(f.field, { type: "server", message: f.message }, { shouldFocus: !applied });
      applied = true;
    }
  }
  return applied;
}

// Form schemas reuse the shared request schemas so the app and server validate the same way.
const optionalName = z
  .string()
  .trim()
  .max(80, "Use 80 characters or fewer")
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const signInSchema = loginRequestSchema.pick({ email: true, password: true });
export const registerFormSchema = registerRequestSchema
  .omit({ displayName: true })
  .extend({ displayName: optionalName });
export const forgotSchema = forgotPasswordRequestSchema;
export const resetFormSchema = resetPasswordRequestSchema;
export const changePasswordSchema = changePasswordRequestSchema;
export const deleteSchema = deleteAccountRequestSchema;
export const nameSchema = updateProfileRequestSchema;
export const codeSchema = verifyEmailRequestSchema;

export type SignInInput = z.input<typeof signInSchema>;
export type RegisterInput = z.input<typeof registerFormSchema>;
export type RegisterOutput = z.output<typeof registerFormSchema>;
export type ForgotInput = z.input<typeof forgotSchema>;
export type ResetInput = z.input<typeof resetFormSchema>;
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
export type DeleteInput = z.input<typeof deleteSchema>;
export type NameInput = z.input<typeof nameSchema>;
