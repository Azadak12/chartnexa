import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { errorEnvelopeSchema } from "@chartnexa/api-contracts";
import { freshEmail, freshIp, GOOD_PASSWORD, makeHarness, type Harness } from "./auth-helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await makeHarness(inject("dbUrl"));
});
afterAll(async () => {
  await h.t.app.close();
});

describe("login rate limiting", () => {
  it("blocks an email after repeated failures, even with the right password, with a retry hint", async () => {
    const { email, password } = await h.register();
    for (let i = 0; i < 5; i++) {
      expect((await h.login(email, "wrong password!", freshIp())).statusCode).toBe(401);
    }
    const blocked = await h.login(email, password, freshIp());
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(errorEnvelopeSchema.parse(blocked.json()).code).toBe("RATE_LIMITED");
  });

  it("does not affect other accounts or honest users", async () => {
    const victim = await h.register();
    for (let i = 0; i < 5; i++) await h.login(victim.email, "wrong password!", freshIp());
    const honest = await h.register();
    for (let i = 0; i < 3; i++) {
      expect((await h.login(honest.email, honest.password, freshIp())).statusCode).toBe(200);
    }
  });

  it("limits one client address across many emails", async () => {
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 21; i++)
      codes.push((await h.login(freshEmail(), "wrong password!", ip)).statusCode);
    expect(codes.slice(0, 20).every((c) => c === 401)).toBe(true);
    expect(codes[20]).toBe(429);
  });
});

describe("registration rate limiting", () => {
  it("limits registrations per client address", async () => {
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      codes.push(
        (
          await h.call("POST", "/auth/register", {
            ip,
            body: { email: freshEmail(), password: GOOD_PASSWORD },
          })
        ).statusCode,
      );
    }
    expect(codes.slice(0, 10).every((c) => c === 202)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
