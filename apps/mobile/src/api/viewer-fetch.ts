import { authedFetch } from "../auth/authed-fetch";
import { sessionStore } from "../session/session-store";
import { apiFetch, type ApiOptions } from "./client";

/**
 * For public pages that show more to a signed-in person (an owner's lessons): sends the token
 * when someone is signed in, and nothing otherwise. The server decides what each caller sees.
 */
export function viewerFetch<T>(
  path: string,
  options: Omit<ApiOptions, "getToken"> = {},
): Promise<T> {
  return sessionStore.get() === "signed-in"
    ? authedFetch<T>(path, options)
    : apiFetch<T>(path, options);
}
