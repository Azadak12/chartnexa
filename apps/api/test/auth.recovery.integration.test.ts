import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { errorEnvelopeSchema } from "@chartnexa/api-contracts";
import {
  freshEmail,
  GOOD_PASSWORD,
  makeHarness,
  stripRequestId,
  type Harness,
} from "./auth-helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await makeHarness(inject("dbUrl"));
});
afterAll(async () => {
  await h.t.app.close();
});

const NEW_PASSWORD = "a brand new passphrase";
const forgot = (email: string) => h.call("POST", "/auth/password/forgot", { body: { email } });
const reset = (token: string, newPassword = NEW_PASSWORD) =>
  h.call("POST", "/auth/password/reset", { body: { token, newPassword } });

describe("forgot password", () => {
  it("responds identically for known and unknown emails and mails only the known one", async () => {
    const { email } = await h.register();
    h.mailer.clear();
    const known = await forgot(email);
    const unknownEmail = freshEmail();
    const unknown = await forgot(unknownEmail);
    expect(known.statusCode).toBe(202);
    expect(stripRequestId(known)).toEqual(stripRequestId(unknown));
    expect(h.mailer.last(email.toLowerCase(), "password_reset")).toBeDefined();
    expect(h.mailer.last(unknownEmail.toLowerCase())).toBeUndefined();
  });

  it("rate-limits requests per email", async () => {
    const { email } = await h.register();
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await forgot(email)).statusCode);
    expect(codes).toEqual([202, 202, 202, 429]);
  });

  it("sends nothing for a deleted account", async () => {
    const s = await h.signIn();
    await h.call("DELETE", "/me", { token: s.accessToken, body: { password: s.password } });
    h.mailer.clear();
    expect((await forgot(s.email)).statusCode).toBe(202);
    expect(h.mailer.outbox).toHaveLength(0);
  });
});

describe("reset password", () => {
  it("changes the password, signs out every session and consumes the token", async () => {
    const s = await h.signIn();
    const other = (await h.login(s.email, s.password)).json();
    await forgot(s.email);
    const token = h.tokenFor(s.email, "password_reset");
    expect((await reset(token)).statusCode).toBe(200);
    expect((await h.call("GET", "/me", { token: s.accessToken })).statusCode).toBe(401);
    expect((await h.call("GET", "/me", { token: other.accessToken })).statusCode).toBe(401);
    expect((await h.login(s.email, s.password)).statusCode).toBe(401);
    expect((await h.login(s.email, NEW_PASSWORD)).statusCode).toBe(200);
    expect((await reset(token, "yet another passphrase")).statusCode).toBe(400);
  });

  it("fails with one generic error for reused, expired, unknown and wrong-type tokens", async () => {
    const { email } = await h.register();
    const verifyToken = h.tokenFor(email, "verify_email");
    await forgot(email);
    const expiring = h.tokenFor(email, "password_reset");
    await h.db.oneTimeToken.updateMany({
      where: { type: "password_reset", user: { emailNormalized: email.toLowerCase() } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const results = [await reset(expiring), await reset("u".repeat(43)), await reset(verifyToken)];
    for (const r of results) expect(r.statusCode).toBe(400);
    expect(new Set(results.map((r) => JSON.stringify(stripRequestId(r)))).size).toBe(1);
  });

  it("keeps the token usable when the new password violates the policy", async () => {
    const { email } = await h.register();
    await forgot(email);
    const token = h.tokenFor(email, "password_reset");
    const weak = await reset(token, "short");
    expect(weak.statusCode).toBe(400);
    const common = await reset(token, "Password123");
    expect(common.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(common.json()).fields?.[0]?.field).toBe("newPassword");
    expect((await reset(token)).statusCode).toBe(200);
  });

  it("invalidates older reset tokens when a newer one is issued and on success", async () => {
    const { email } = await h.register();
    await forgot(email);
    const first = h.tokenFor(email, "password_reset");
    await forgot(email);
    const second = h.tokenFor(email, "password_reset");
    expect((await reset(first)).statusCode).toBe(400);
    expect((await reset(second)).statusCode).toBe(200);
  });

  it("fails generically for a disabled account", async () => {
    const { email } = await h.register();
    await forgot(email);
    const token = h.tokenFor(email, "password_reset");
    await h.db.user.update({
      where: { emailNormalized: email.toLowerCase() },
      data: { status: "disabled" },
    });
    expect((await reset(token)).statusCode).toBe(400);
  });

  it("lets only one of two simultaneous redemptions win", async () => {
    const { email } = await h.register();
    await forgot(email);
    const token = h.tokenFor(email, "password_reset");
    const rs = await Promise.all([
      reset(token, "first winner passphrase"),
      reset(token, "second winner passphrase"),
    ]);
    expect(rs.map((r) => r.statusCode).sort()).toEqual([200, 400]);
  });
});

describe("change password", () => {
  it("changes the password, revokes other sessions and keeps the current one", async () => {
    const s = await h.signIn();
    const other = (await h.login(s.email, s.password)).json();
    const res = await h.call("POST", "/me/password", {
      token: s.accessToken,
      body: { currentPassword: s.password, newPassword: NEW_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect((await h.call("GET", "/me", { token: s.accessToken })).statusCode).toBe(200);
    expect((await h.call("GET", "/me", { token: other.accessToken })).statusCode).toBe(401);
    expect((await h.login(s.email, s.password)).statusCode).toBe(401);
    expect((await h.login(s.email, NEW_PASSWORD)).statusCode).toBe(200);
  });

  it("rejects a wrong current password and counts failures toward a limit", async () => {
    const s = await h.signIn();
    const attempt = (p: string) =>
      h.call("POST", "/me/password", {
        token: s.accessToken,
        body: { currentPassword: p, newPassword: NEW_PASSWORD },
      });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await attempt("definitely wrong")).statusCode);
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
    expect((await attempt(s.password)).statusCode).toBe(429);
    expect((await h.login(s.email, s.password)).statusCode).toBe(200);
  });

  it("applies the password policy to the new password", async () => {
    const s = await h.signIn();
    const res = await h.call("POST", "/me/password", {
      token: s.accessToken,
      body: { currentPassword: s.password, newPassword: "Password123" },
    });
    expect(res.statusCode).toBe(400);
    expect(GOOD_PASSWORD).toBeTruthy();
  });
});
