import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { freshEmail, makeHarness, type Harness } from "./auth-helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await makeHarness(inject("dbUrl"));
});
afterAll(async () => {
  await h.t.app.close();
});

describe("log hygiene across the full auth flows", () => {
  it("never logs passwords, tokens, hashes, reset links or emails; events carry only ids", async () => {
    const email = freshEmail();
    const password = "Unique-Passphrase-For-Log-Test-9X";
    const newPassword = "Another-Unique-Passphrase-Log-7Q";
    await h.call("POST", "/auth/register", { body: { email, password } });
    const hash = (
      await h.db.user.findUniqueOrThrow({ where: { emailNormalized: email.toLowerCase() } })
    ).passwordHash;
    const verifyToken = h.tokenFor(email, "verify_email");
    await h.call("POST", "/auth/email/verify", { body: { token: verifyToken } });
    await h.login(email, "wrong-password-value-zzz");
    const login = (await h.login(email, password)).json();
    const refreshed = (
      await h.call("POST", "/auth/refresh", { body: { refreshToken: login.refreshToken } })
    ).json();
    await h.call("POST", "/auth/refresh", { body: { refreshToken: login.refreshToken } }); // reuse
    const again = (await h.login(email, password)).json();
    await h.call("POST", "/auth/password/forgot", { body: { email } });
    const resetToken = h.tokenFor(email, "password_reset");
    await h.call("POST", "/auth/password/reset", { body: { token: resetToken, newPassword } });
    const third = (await h.login(email, newPassword)).json();
    await h.call("POST", "/me/password", {
      token: third.accessToken,
      body: { currentPassword: newPassword, newPassword: password },
    });
    await h.call("POST", "/auth/logout", { token: third.accessToken });
    const fourth = (await h.login(email, password)).json();
    await h.call("DELETE", "/me", { token: fourth.accessToken, body: { password } });

    const logs = h.t.logs();
    const secrets = [
      password,
      newPassword,
      "wrong-password-value-zzz",
      verifyToken,
      resetToken,
      login.accessToken,
      login.refreshToken,
      refreshed.accessToken,
      refreshed.refreshToken,
      again.accessToken,
      third.refreshToken,
      fourth.refreshToken,
      email,
      email.toLowerCase(),
      email.split("@")[0] as string,
      "$argon2id$",
      "reset-password?token",
      "verify-email?token",
    ];
    if (hash) secrets.push(hash);
    for (const secret of secrets) {
      expect(logs.includes(secret), `log contains ${secret.slice(0, 12)}...`).toBe(false);
    }

    const events = logs
      .split("\n")
      .filter((l) => l.includes('"event":"auth.'))
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const names = new Set(events.map((e) => e["event"]));
    for (const expected of [
      "auth.login.failure",
      "auth.login.success",
      "auth.refresh.reuse_detected",
      "auth.password.reset",
      "auth.password.changed",
      "auth.session.revoked",
      "auth.account.deleted",
    ]) {
      expect(names.has(expected), expected).toBe(true);
    }
    const allowed = new Set([
      "level",
      "time",
      "service",
      "requestId",
      "traceId",
      "event",
      "userId",
      "sessionId",
      "outcome",
      "msg",
    ]);
    for (const e of events) {
      for (const key of Object.keys(e))
        expect(allowed.has(key), `unexpected log field ${key}`).toBe(true);
      expect(typeof e["requestId"]).toBe("string");
    }
  });
});

describe("openapi for auth", () => {
  it("lists every auth route with 401/429 envelope responses and no token values", async () => {
    const res = await h.t.app.inject({ method: "GET", url: "/openapi.json" });
    const doc = res.json();
    const expected = [
      "/auth/register",
      "/auth/login",
      "/auth/refresh",
      "/auth/logout",
      "/auth/logout-all",
      "/auth/email/verify",
      "/auth/email/resend",
      "/auth/password/forgot",
      "/auth/password/reset",
      "/me",
      "/me/password",
      "/me/sessions",
      "/me/sessions/{id}",
    ];
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(expected));
    const login = doc.paths["/auth/login"].post.responses;
    expect(login["401"].content["application/json"].schema.$ref).toBe(
      "#/components/schemas/ErrorEnvelope",
    );
    expect(login["429"]).toBeDefined();
    expect(doc.paths["/me"].get.responses["401"]).toBeDefined();
    expect(doc.paths["/me"].get.security).toEqual([{ bearer: [] }]);
    expect(JSON.stringify(doc)).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });
});
