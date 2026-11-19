import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { errorEnvelopeSchema } from "@chartnexa/api-contracts";
import { startApp, type TestApp } from "./support.js";

let t: TestApp;
beforeAll(async () => {
  t = await startApp({ DATABASE_URL: inject("dbUrl") });
});
afterAll(async () => {
  await t.app.close();
});

const get = (url: string, headers: Record<string, string> = {}) =>
  t.app.inject({ method: "GET", url, headers });

describe("health", () => {
  it("liveness and readiness succeed with a reachable database", async () => {
    expect((await get("/health/live")).json()).toEqual({ status: "ok" });
    const ready = await get("/health/ready");
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ok" });
  });

  it("readiness fails in the envelope while liveness still passes when the database is down", async () => {
    const down = await startApp({ DATABASE_URL: "postgresql://nobody@127.0.0.1:1/none" });
    try {
      const ready = await down.app.inject({ method: "GET", url: "/health/ready" });
      expect(ready.statusCode).toBe(503);
      expect(errorEnvelopeSchema.safeParse(ready.json()).success).toBe(true);
      expect((await down.app.inject({ method: "GET", url: "/health/live" })).statusCode).toBe(200);
    } finally {
      await down.app.close();
    }
  });
});

describe("security headers (security review S2)", () => {
  it("are sent on successful, failed and unmatched answers", async () => {
    for (const url of ["/health/live", "/courses/not-a-uuid", "/no-such-route"]) {
      const res = await get(url);
      expect(res.headers["cache-control"], url).toBe("no-store");
      expect(res.headers["x-content-type-options"], url).toBe("nosniff");
      expect(res.headers["content-security-policy"], url).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
      expect(res.headers["referrer-policy"], url).toBe("no-referrer");
      expect(res.headers["x-frame-options"], url).toBe("DENY");
    }
  });
});

describe("request ids", () => {
  it("echoes a valid supplied id and logs it", async () => {
    const res = await get("/health/live", { "x-request-id": "client-req-12345" });
    expect(res.headers["x-request-id"]).toBe("client-req-12345");
    expect(t.logs()).toContain("client-req-12345");
  });

  it("replaces a malformed id and never echoes it", async () => {
    const res = await get("/health/live", { "x-request-id": "bad id with spaces!!" });
    expect(res.headers["x-request-id"]).not.toContain("bad id");
    expect(String(res.headers["x-request-id"])).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });
});

describe("error envelope", () => {
  it("404 uses the envelope with the request id", async () => {
    const res = await get("/nope", { "x-request-id": "req-404-abcdef" });
    expect(res.statusCode).toBe(404);
    const body = errorEnvelopeSchema.parse(res.json());
    expect(body).toMatchObject({ code: "NOT_FOUND", requestId: "req-404-abcdef" });
  });

  it("500 hides internals but logs the failure with the same request id", async () => {
    const res = await get("/test/boom", { "x-request-id": "req-500-abcdef" });
    expect(res.statusCode).toBe(500);
    const text = res.body;
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("/srv/secret");
    expect(text).not.toContain("at ");
    expect(errorEnvelopeSchema.parse(res.json()).requestId).toBe("req-500-abcdef");
    const logged = t
      .logs()
      .split("\n")
      .filter((l) => l.includes("unhandled error"));
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.join("")).toContain("req-500-abcdef");
  });
});

describe("validation", () => {
  it("400 lists failing fields", async () => {
    const res = await t.app.inject({ method: "POST", url: "/test/echo", payload: { name: "A" } });
    expect(res.statusCode).toBe(400);
    const body = errorEnvelopeSchema.parse(res.json());
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.fields?.[0]?.field).toBe("name");
  });
  it("rejects unknown properties", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/test/echo",
      payload: { name: "Al", x: 1 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("pagination params", () => {
  it("caps the limit and rejects tampered cursors", async () => {
    expect((await get("/test/page?limit=101")).statusCode).toBe(400);
    expect((await get("/test/page?limit=5")).json()).toEqual({ limit: 5 });
    const bad = await get("/test/page?cursor=tampered.value");
    expect(bad.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(bad.json()).code).toBe("BAD_REQUEST");
  });
});

describe("log hygiene", () => {
  it("never logs an Authorization header value", async () => {
    await get("/health/live", {
      authorization: "Bearer TOPSECRET-TOKEN-XYZ",
      cookie: "sid=COOKIE-ABC",
    });
    expect(t.logs()).not.toContain("TOPSECRET-TOKEN-XYZ");
    expect(t.logs()).not.toContain("COOKIE-ABC");
  });
});

describe("openapi", () => {
  it("lists health endpoints and the error schema outside production", async () => {
    const res = await get("/openapi.json");
    expect(res.statusCode).toBe(200);
    const doc = res.json();
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(["/health/live", "/health/ready"]),
    );
    expect(doc.components.schemas.ErrorEnvelope.properties.requestId).toBeDefined();
  });

  it("is not served in production", async () => {
    const prod = await startApp({ DATABASE_URL: inject("dbUrl") }, { asProduction: true });
    try {
      expect((await prod.app.inject({ method: "GET", url: "/openapi.json" })).statusCode).toBe(404);
    } finally {
      await prod.app.close();
    }
  });
});
