import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  fromResponse,
  isAppError,
  networkError,
  AppError,
  messageFor,
  waitMessage,
} from "./errors";

export const REQUEST_TIMEOUT_MS = 15000;

export function apiBaseUrl(): string {
  // EXPO_PUBLIC_ values are inlined into the bundle at build time.
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (fromEnv) return fromEnv;
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

/** Platform and OS version, for example "iOS 18.1". Never a hardware identifier. */
export function deviceLabel(): string {
  const os = Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : Platform.OS;
  return `${os} ${Platform.Version === undefined ? "" : String(Platform.Version)}`
    .trim()
    .slice(0, 80);
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
 * message; response text is never exposed. It never ends the session itself: callers that use a
 * token go through `authedFetch`, which renews the token once and decides.
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
        "x-device-label": deviceLabel(),
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
  const retryAfter = Number(response.headers.get("retry-after"));
  const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
  const message =
    error.kind === "rate_limited" && retryAfterSeconds
      ? waitMessage(retryAfterSeconds)
      : error.message;
  throw new AppError(error.kind, message, error.status, withId, error.fields, retryAfterSeconds);
}

export { isAppError, messageFor };
