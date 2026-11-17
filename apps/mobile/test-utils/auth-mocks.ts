import { AppError, messageFor, waitMessage, type AppErrorKind } from "../src/api/errors";

export const pair = (n = 1) => ({
  accessToken: `access-token-value-${n}`,
  refreshToken: `refresh-token-value-${n}-xxxxxxxxxxxxxxxx`,
  sessionId: `session-${n}`,
  expiresIn: 600,
});

export const appError = (
  kind: AppErrorKind,
  extra: {
    fields?: Array<{ field: string; message: string }>;
    retryAfter?: number;
    requestId?: string;
  } = {},
) =>
  new AppError(
    kind,
    kind === "rate_limited" && extra.retryAfter ? waitMessage(extra.retryAfter) : messageFor(kind),
    null,
    extra.requestId ?? "req-12345678",
    extra.fields ?? [],
    extra.retryAfter ?? null,
  );

/** Captures every console call so a test can prove no secret was written. */
export function spyOnConsole() {
  const calls: unknown[][] = [];
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      calls.push(a);
    }),
  );
  return {
    text: () => JSON.stringify(calls),
    restore: () => spies.forEach((s) => s.mockRestore()),
  };
}
