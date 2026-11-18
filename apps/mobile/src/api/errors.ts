import { errorEnvelopeSchema, type FieldError } from "@chartnexa/api-contracts";

export type AppErrorKind =
  | "network"
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "unavailable"
  | "server"
  | "unknown";

/** A failure ready to show to a person: plain language, never raw server text. */
export class AppError extends Error {
  constructor(
    public readonly kind: AppErrorKind,
    message: string,
    public readonly status: number | null,
    /** Reference for support; shown in small print. */
    public readonly requestId: string | null,
    public readonly fields: FieldError[] = [],
    /** Seconds to wait when the server asked the app to slow down (HTTP Retry-After). */
    public readonly retryAfterSeconds: number | null = null,
    /** The server's machine code, for the few cases that need more than the kind. */
    public readonly code: string | null = null,
  ) {
    super(message);
    this.name = "AppError";
  }
}

const MESSAGES: Record<AppErrorKind, string> = {
  network:
    "You appear to be offline or we cannot reach the server. Check your connection and try again.",
  validation: "Please check the highlighted fields and try again.",
  unauthorized: "Your session has ended. Please sign in again.",
  forbidden: "You do not have permission to do that.",
  not_found: "We could not find what you were looking for.",
  conflict: "That could not be completed because something changed. Please refresh and try again.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
  unavailable: "The service is temporarily unavailable. Please try again shortly.",
  server: "Something went wrong on our side. Please try again.",
  unknown: "Something went wrong. Please try again.",
};

const BY_CODE: Record<string, AppErrorKind> = {
  VALIDATION_FAILED: "validation",
  BAD_REQUEST: "validation",
  UNAUTHENTICATED: "unauthorized",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  RATE_LIMITED: "rate_limited",
  UNAVAILABLE: "unavailable",
  INTERNAL_ERROR: "server",
};

export function messageFor(kind: AppErrorKind): string {
  return MESSAGES[kind];
}

/** "Too many attempts" with how long to wait, in the unit a person understands. */
export function waitMessage(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  const wait = s < 90 ? `${s} second${s === 1 ? "" : "s"}` : `${Math.ceil(s / 60)} minutes`;
  return `Too many attempts. Please wait about ${wait} and try again.`;
}

/**
 * Maps an HTTP failure to an AppError. Only the error code, request id and field messages from
 * a valid envelope are used; any other body text is discarded and never shown.
 */
export function fromResponse(status: number, body: unknown): AppError {
  const parsed = errorEnvelopeSchema.safeParse(body);
  if (parsed.success) {
    const env = parsed.data;
    const kind = BY_CODE[env.code] ?? kindFromStatus(status);
    return new AppError(
      kind,
      MESSAGES[kind],
      status,
      env.requestId,
      env.fields ?? [],
      null,
      env.code,
    );
  }
  const kind = kindFromStatus(status);
  return new AppError(kind, MESSAGES[kind], status, null);
}

function kindFromStatus(status: number): AppErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status === 503) return "unavailable";
  if (status === 400 || status === 422) return "validation";
  if (status >= 500) return "server";
  return "unknown";
}

export function networkError(requestId: string): AppError {
  return new AppError("network", MESSAGES.network, null, requestId);
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
