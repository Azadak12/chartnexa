import { isAppError, messageFor } from "../api/errors";

/** A plain-language message for any failure, for forms that have no field to attach it to. */
export function formMessage(error: unknown): string {
  return isAppError(error) ? error.message : messageFor("unknown");
}
