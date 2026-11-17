import { apiFetch, newRequestId } from "../src/api/client";
import {
  AppError,
  fromResponse,
  messageFor,
  waitMessage,
  type AppErrorKind,
} from "../src/api/errors";
import { shouldRetry } from "../src/state/query-client";
import { sessionStore } from "../src/session/session-store";

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  }) as unknown as Response;

const envelope = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  message: "RAW SERVER TEXT select * from users",
  requestId: "req-12345678",
  ...extra,
});

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  sessionStore.set("signed-out");
});

async function failure(status: number, body: unknown): Promise<AppError> {
  fetchMock.mockResolvedValueOnce(jsonResponse(status, body));
  try {
    await apiFetch("/x");
  } catch (e) {
    return e as AppError;
  }
  throw new Error("expected a failure");
}

describe("error mapping", () => {
  it.each<[string, number, AppErrorKind]>([
    ["VALIDATION_FAILED", 400, "validation"],
    ["BAD_REQUEST", 400, "validation"],
    ["UNAUTHENTICATED", 401, "unauthorized"],
    ["FORBIDDEN", 403, "forbidden"],
    ["NOT_FOUND", 404, "not_found"],
    ["CONFLICT", 409, "conflict"],
    ["RATE_LIMITED", 429, "rate_limited"],
    ["UNAVAILABLE", 503, "unavailable"],
    ["INTERNAL_ERROR", 500, "server"],
  ])(
    "maps %s to a plain-language message with the support reference",
    async (code, status, kind) => {
      const e = await failure(status, envelope(code));
      expect(e.kind).toBe(kind);
      expect(e.message).toBe(messageFor(kind));
      expect(e.requestId).toBe("req-12345678");
      expect(e.message).not.toMatch(/RAW SERVER TEXT|select|INTERNAL_ERROR|VALIDATION/);
    },
  );

  it("keeps field-level validation errors for the form fields", async () => {
    const e = await failure(
      400,
      envelope("VALIDATION_FAILED", {
        fields: [{ field: "email", message: "Enter a valid email" }],
      }),
    );
    expect(e.fields).toEqual([{ field: "email", message: "Enter a valid email" }]);
  });

  it("shows only a generic message when the body is not a valid envelope", async () => {
    for (const body of [
      "<html>proxy error stack trace</html>",
      { error: "secret details", stack: "at x" },
      null,
    ]) {
      const e = await failure(502, body);
      expect(e.kind).toBe("server");
      expect(e.message).toBe(messageFor("server"));
      expect(JSON.stringify(e.message)).not.toMatch(/proxy|secret|stack/);
    }
    expect(fromResponse(418, {}).kind).toBe("unknown");
  });

  it("uses the response header as the support reference when the body has none", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, "oops", { "x-request-id": "hdr-12345678" }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ requestId: "hdr-12345678" });
  });
});

describe("network failures and timeouts", () => {
  it("reports a network failure that differs from a server error and still carries a reference", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    const e = (await apiFetch("/x").catch((x: unknown) => x)) as AppError;
    expect(e.kind).toBe("network");
    expect(e.message).toBe(messageFor("network"));
    expect(e.message).not.toBe(messageFor("server"));
    expect(e.requestId).toMatch(/^app-/);
  });

  it("gives up after the timeout as a network failure", async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_res, rej) =>
          init.signal?.addEventListener("abort", () => rej(new Error("aborted"))),
        ),
    );
    const pending = apiFetch("/slow", { timeoutMs: 1000 }).catch((x: unknown) => x);
    await jest.advanceTimersByTimeAsync(1000);
    expect(((await pending) as AppError).kind).toBe("network");
    jest.useRealTimers();
  });
});

describe("requests", () => {
  it("sends JSON, a correlation id the server accepts, and the token when supplied", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const out = await apiFetch<{ ok: boolean }>("/things", {
      method: "POST",
      body: { a: 1 },
      getToken: () => "tok",
    });
    expect(out).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url.endsWith("/things")).toBe(true);
    expect(init.body).toBe('{"a":1}');
    expect(init.headers["authorization"]).toBe("Bearer tok");
    expect(init.headers["x-request-id"]).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(newRequestId()).not.toBe(newRequestId());
  });

  it("sends no authorization header without a token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    await apiFetch("/open");
    const init = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers["authorization"]).toBeUndefined();
  });

  it("does not end the session itself on 401 (callers that hold a token renew first)", async () => {
    sessionStore.set("signed-in");
    await failure(401, envelope("UNAUTHENTICATED"));
    expect(sessionStore.get()).toBe("signed-in");
  });

  it("keeps the session on other failures", async () => {
    sessionStore.set("signed-in");
    await failure(403, envelope("FORBIDDEN"));
    expect(sessionStore.get()).toBe("signed-in");
  });

  it("sends a device label made of platform and OS version only", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    await apiFetch("/open");
    const init = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers["x-device-label"]).toMatch(/^(iOS|Android|\w+)( [\w.]+)?$/);
  });
});

describe("rate limit", () => {
  it("turns Retry-After into a message with the wait", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, envelope("RATE_LIMITED"), { "retry-after": "42" }),
    );
    const e = (await apiFetch("/x").catch((x: unknown) => x)) as AppError;
    expect(e.kind).toBe("rate_limited");
    expect(e.retryAfterSeconds).toBe(42);
    expect(e.message).toBe(waitMessage(42));
    expect(e.message).toMatch(/42 seconds/);
  });

  it("uses minutes for long waits and a generic message without the header", async () => {
    expect(waitMessage(600)).toMatch(/10 minutes/);
    expect(waitMessage(1)).toMatch(/1 second\b/);
    fetchMock.mockResolvedValueOnce(jsonResponse(429, envelope("RATE_LIMITED")));
    const e = (await apiFetch("/x").catch((x: unknown) => x)) as AppError;
    expect(e.retryAfterSeconds).toBeNull();
    expect(e.message).toBe(messageFor("rate_limited"));
  });
});

describe("retry policy", () => {
  it("retries only transient failures, at most twice, and never a 4xx", () => {
    const net = new AppError("network", "m", null, "r");
    const srv = new AppError("server", "m", 500, "r");
    expect(shouldRetry(0, net)).toBe(true);
    expect(shouldRetry(1, srv)).toBe(true);
    expect(shouldRetry(2, net)).toBe(false);
    for (const kind of [
      "validation",
      "unauthorized",
      "forbidden",
      "not_found",
      "conflict",
      "rate_limited",
    ] as const) {
      expect(shouldRetry(0, new AppError(kind, "m", 400, "r"))).toBe(false);
    }
    expect(shouldRetry(0, new Error("boom"))).toBe(false);
  });
});
