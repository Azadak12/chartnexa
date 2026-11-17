import Constants from "expo-constants";
import { fromResponse, isAppError, networkError, AppError, messageFor } from "./errors";
import { sessionStore } from "../session/session-store";

export const REQUEST_TIMEOUT_MS = 15000;

export function apiBaseUrl(): string {
  const configured = Constants.expoConfig?.extra?.["apiBaseUrl"];
  return typeof configured === "string" && configured.length > 0
    ? configured
    : "http://localhost:3000";
}

/** A correlation id the server accepts (8-64 letters, digits, hyphen), so even a failed request has one. */
export function newRequestId(): string {
  const rand = () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, "0");
  return `app-${Date.now().toString(16)}-${rand()}`;
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Supplies the access token. `mobile-auth` will provide this; none exists yet. */
  getToken?: () => string | null;
  timeoutMs?: number;
}

/**
 * Calls the API and returns parsed JSON. Failures are thrown as AppError with a plain-language
 * message; response text is never exposed. A 401 ends the session so the person is asked to sign
 * in again and returns to the same screen.
 */
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const requestId = newRequestId();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  options.signal?.addEventListener("abort", () => controller.abort());
  const token = options.getToken?.() ?? null;
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        "x-request-id": requestId,
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: controller.signal,
    });
  } catch {
    // Offline, DNS failure, refused connection or timeout: all look the same to the person.
    throw networkError(requestId);
  } finally {
    clearTimeout(timer);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON (for example a proxy error page): handled below without showing any of it.
  }
  if (response.ok) return body as T;

  const error = fromResponse(response.status, body);
  const withId = error.requestId ?? response.headers.get("x-request-id") ?? requestId;
  const final = new AppError(error.kind, error.message, error.status, withId, error.fields);
  if (final.kind === "unauthorized") sessionStore.expire();
  throw final;
}

export { isAppError, messageFor };
