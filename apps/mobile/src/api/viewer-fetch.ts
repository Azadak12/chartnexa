import { authedFetch } from "../auth/authed-fetch";
import { sessionStore } from "../session/session-store";
import { apiFetch } from "./client";

/**
 * For public pages that show more to a signed-in person (an owner's lessons): sends the token
 * when someone is signed in, and nothing otherwise. The server decides what each caller sees.
 */
export function viewerFetch<T>(path: string): Promise<T> {
  return sessionStore.get() === "signed-in" ? authedFetch<T>(path) : apiFetch<T>(path);
}
