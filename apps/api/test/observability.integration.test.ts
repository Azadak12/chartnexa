import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { LogErrorReporter } from "../src/platform/error-reporter.js";
import { person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

const lines = () =>
  h.t
    .logs()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);

describe("logs hold no personal data from URLs or errors", () => {
  it("drop the lookup email and search terms from request lines", async () => {
    const admin = await person(h, "admin");
    await h.call("GET", "/staff/users/lookup?email=probe-leak%40example.com", {
      token: admin.accessToken,
    });
    await h.call("GET", "/courses?q=SEARCHTERM-SECRET-1");
    const logs = h.t.logs();
    expect(logs).not.toContain("probe-leak");
    expect(logs).not.toContain("SEARCHTERM-SECRET-1");
    expect(logs).toContain('"url":"/staff/users/lookup?email="');
  });

  it("log an unexpected error once, classified, without its message", async () => {
    const spy = vi.spyOn(LogErrorReporter.prototype, "report");
    try {
      const res = await h.call("GET", "/test/boom-db");
      expect(res.statusCode).toBe(500);
      expect(res.body).not.toContain("leak-me");
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
    const logs = h.t.logs();
    expect(logs).not.toContain("leak-me@example.com");
    const line = lines().find((l) => l.msg === "unhandled error" && l.route === "/test/boom-db");
    expect(line).toBeTruthy();
    expect(line!.err).toMatchObject({
      type: "PrismaClientKnownRequestError",
      code: "P1001",
      errorClass: "dependency",
    });
    expect(typeof line!.requestId).toBe("string");
    expect(line!.traceId).toMatch(/^[0-9a-f]{32}$/);
    const other = await h.call("GET", "/test/boom");
    expect(other.statusCode).toBe(500);
    expect(h.t.logs()).not.toContain("hunter2");
    const bug = lines().find((l) => l.msg === "unhandled error" && l.route === "/test/boom");
    expect((bug!.err as { errorClass: string }).errorClass).toBe("server");
  });

  it("report nothing for client errors", async () => {
    const spy = vi.spyOn(LogErrorReporter.prototype, "report");
    try {
      await h.call("POST", "/test/echo", { body: { name: "" } });
      await h.call("GET", "/me");
      await h.call("GET", "/no/such/route");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("trace ids", () => {
  it("follow a valid traceparent into the logs and the response", async () => {
    const id = "4bf92f3577b34da6a3ce929d0e0e4736";
    const res = await h.call("GET", "/health/live", {
      headers: { traceparent: `00-${id}-00f067aa0ba902b7-01`, "x-request-id": "trace-req-0001" },
    });
    expect(res.headers["x-trace-id"]).toBe(id);
    const mine = lines().filter((l) => l.requestId === "trace-req-0001");
    expect(mine.length).toBeGreaterThanOrEqual(2);
    for (const l of mine) expect(l.traceId).toBe(id);
  });

  it("make a new one for a malformed header", async () => {
    const res = await h.call("GET", "/health/live", { headers: { traceparent: "nonsense" } });
    expect(res.headers["x-trace-id"]).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("metrics", () => {
  it("count requests by route pattern, never raw ids or queries", async () => {
    await h.call("GET", "/courses/00000000-0000-4000-8000-000000000009");
    await h.call("GET", "/courses?q=METRIC-SECRET");
    await h.call("GET", "/definitely/unknown/path-123");
    const res = await h.call("GET", "/metrics");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    const t = res.body;
    expect(t).toContain('route="/courses/:id"');
    expect(t).toContain('route="unmatched"');
    expect(t).not.toContain("00000000-0000-4000-8000-000000000009");
    expect(t).not.toContain("METRIC-SECRET");
    expect(t).not.toContain("path-123");
    expect(t).not.toContain('route="/metrics"');
    expect(t).toMatch(/app_errors_total\{error_class="(server|dependency)"\} \d+/);
  });
});
