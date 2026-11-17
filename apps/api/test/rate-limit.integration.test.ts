import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { MAILER, MemoryMailer } from "../src/modules/mailer/index.js";
import { RateLimiterService } from "../src/modules/rate-limit/index.js";
import { RateLimitedException } from "../src/platform/rate-limited.exception.js";
import { errorEnvelopeSchema } from "@chartnexa/api-contracts";
import { startApp, type TestApp } from "./support.js";

let a: TestApp;
let b: TestApp;
beforeAll(async () => {
  a = await startApp({ DATABASE_URL: inject("dbUrl") });
  b = await startApp({ DATABASE_URL: inject("dbUrl") });
});
afterAll(async () => {
  await a.app.close();
  await b.app.close();
});

describe("RateLimiterService", () => {
  it("allows up to max and then throws with a retry hint", async () => {
    const rl = a.app.get(RateLimiterService);
    const key = `t:${randomUUID()}`;
    for (let i = 0; i < 3; i++) await rl.consume(key, 3, 60);
    await expect(rl.consume(key, 3, 60)).rejects.toBeInstanceOf(RateLimitedException);
    try {
      await rl.consume(key, 3, 60);
    } catch (e) {
      expect((e as RateLimitedException).retryAfterSeconds).toBeGreaterThan(0);
      expect((e as RateLimitedException).retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it("counts across separate API instances", async () => {
    const key = `t:${randomUUID()}`;
    await a.app.get(RateLimiterService).consume(key, 2, 60);
    await b.app.get(RateLimiterService).consume(key, 2, 60);
    await expect(a.app.get(RateLimiterService).consume(key, 2, 60)).rejects.toBeInstanceOf(
      RateLimitedException,
    );
  });

  it("assertBelow does not count and resets in a new window", async () => {
    const rl = a.app.get(RateLimiterService);
    const key = `t:${randomUUID()}`;
    for (let i = 0; i < 5; i++) await rl.assertBelow(key, 2, 60);
    await rl.hit(key, 60);
    await rl.hit(key, 60);
    await expect(rl.assertBelow(key, 2, 60)).rejects.toBeInstanceOf(RateLimitedException);
    // A different window length is a different bucket start, standing in for an elapsed window.
    await expect(rl.assertBelow(key, 2, 61)).resolves.toBeUndefined();
  });

  it("survives concurrent hits without losing counts", async () => {
    const rl = a.app.get(RateLimiterService);
    const key = `t:${randomUUID()}`;
    await Promise.all(Array.from({ length: 20 }, () => rl.hit(key, 60)));
    expect((await rl.peek(key, 60)).count).toBe(20);
  });
});

describe("mailer wiring", () => {
  it("uses the memory mailer in tests and captures messages", async () => {
    const mailer = a.app.get<MemoryMailer>(MAILER);
    await mailer.send({ to: "x@y.co", template: "password_reset", data: { token: "t" } });
    expect(mailer.last("x@y.co", "password_reset")?.data["token"]).toBe("t");
  });
});

describe("429 envelope", () => {
  it("is exercised end to end by the auth tests", () => {
    expect(
      errorEnvelopeSchema.safeParse({ code: "RATE_LIMITED", message: "m", requestId: "r" }).success,
    ).toBe(true);
  });
});
