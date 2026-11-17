import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { errorEnvelopeSchema } from "@chartnexa/api-contracts";
import { PasswordService } from "../src/modules/identity/password/password.service.js";
import { AccessTokenService } from "../src/modules/identity/tokens/access-token.service.js";
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

const refresh = (token: string) =>
  h.call("POST", "/auth/refresh", { body: { refreshToken: token } });

describe("login", () => {
  it("issues tokens for valid credentials, case-insensitively", async () => {
    const { email, password } = await h.register();
    const res = await h.login(email.toUpperCase(), password);
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.expiresIn).toBe(600);
    expect(j.refreshToken.length).toBeGreaterThan(30);
    expect(j.sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns the same 401 for an unknown email and a wrong password", async () => {
    const { email } = await h.register();
    const wrong = await h.login(email, "wrong password value");
    const unknown = await h.login(freshEmail(), "wrong password value");
    expect(wrong.statusCode).toBe(401);
    expect(stripRequestId(wrong)).toEqual(stripRequestId(unknown));
    expect(errorEnvelopeSchema.parse(wrong.json()).code).toBe("UNAUTHENTICATED");
  });

  it("still performs a password-hash computation for an unknown email", async () => {
    const svc = h.t.app.get(PasswordService);
    const spy = vi.spyOn(svc, "verifyDummy");
    await h.login(freshEmail(), "whatever password");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("stores only a hash of the refresh token", async () => {
    const s = await h.signIn();
    const row = await h.db.session.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(row.refreshHash).not.toBe(s.refreshToken);
    expect(row.refreshHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("authentication guard", () => {
  it("rejects missing, malformed, wrongly signed and expired tokens", async () => {
    const s = await h.signIn();
    const tokens = h.t.app.get(AccessTokenService);
    const claims = { userId: "00000000-0000-0000-0000-000000000000", sessionId: s.sessionId };
    const forged = await new SignJWT({ sid: s.sessionId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("someone")
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("z".repeat(40)));
    const expired = await tokens.sign(
      {
        ...claims,
        userId: (await h.db.session.findUniqueOrThrow({ where: { id: s.sessionId } })).userId,
      },
      -5,
    );
    for (const token of ["garbage", forged, expired]) {
      const res = await h.call("GET", "/me", { token });
      expect(res.statusCode).toBe(401);
      expect(errorEnvelopeSchema.parse(res.json()).code).toBe("UNAUTHENTICATED");
    }
    const bad = await h.call("GET", "/me", { headers: { authorization: "Basic abc" } });
    expect(bad.statusCode).toBe(401);
    const none = await h.call("GET", "/me");
    expect(none.statusCode).toBe(401);
  });

  it("rejects a valid token whose session was revoked", async () => {
    const s = await h.signIn();
    await h.db.session.update({ where: { id: s.sessionId }, data: { revokedAt: new Date() } });
    expect((await h.call("GET", "/me", { token: s.accessToken })).statusCode).toBe(401);
  });
});

describe("refresh rotation", () => {
  it("rotates, and the old token stops working and revokes the session when reused", async () => {
    const s = await h.signIn();
    const r1 = await refresh(s.refreshToken);
    expect(r1.statusCode).toBe(200);
    const next = r1.json();
    expect(next.refreshToken).not.toBe(s.refreshToken);
    expect((await h.call("GET", "/me", { token: next.accessToken })).statusCode).toBe(200);

    const reuse = await refresh(s.refreshToken);
    expect(reuse.statusCode).toBe(401);
    expect(h.t.logs()).toContain("auth.refresh.reuse_detected");
    expect(h.t.logs()).toContain(s.sessionId);
    // The legitimate newest token and its access token are now dead too.
    expect((await refresh(next.refreshToken)).statusCode).toBe(401);
    expect((await h.call("GET", "/me", { token: next.accessToken })).statusCode).toBe(401);
    const row = await h.db.session.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(row.revokedReason).toBe("reuse_detected");
  });

  it("lets only one of two simultaneous refreshes with one token succeed and revokes the session", async () => {
    const s = await h.signIn();
    const rs = await Promise.all([refresh(s.refreshToken), refresh(s.refreshToken)]);
    expect(rs.map((r) => r.statusCode).sort()).toEqual([200, 401]);
    const row = await h.db.session.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(row.revokedAt).not.toBeNull();
    const winner = rs.find((r) => r.statusCode === 200)!.json();
    expect((await h.call("GET", "/me", { token: winner.accessToken })).statusCode).toBe(401);
  });

  it("slides the expiry on rotation but never past the absolute cap", async () => {
    const s = await h.signIn();
    const day = 24 * 3600 * 1000;
    await h.db.session.update({
      where: { id: s.sessionId },
      data: {
        expiresAt: new Date(Date.now() + day),
        absoluteExpiresAt: new Date(Date.now() + 5 * day),
      },
    });
    expect((await refresh(s.refreshToken)).statusCode).toBe(200);
    const row = await h.db.session.findUniqueOrThrow({ where: { id: s.sessionId } });
    // 30-day sliding window is capped by the 5-day absolute limit.
    expect(Math.abs(row.expiresAt.getTime() - row.absoluteExpiresAt.getTime())).toBeLessThan(1000);

    const fresh = await h.signIn();
    expect((await refresh(fresh.refreshToken)).statusCode).toBe(200);
    const r2 = await h.db.session.findUniqueOrThrow({ where: { id: fresh.sessionId } });
    expect(r2.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * day);
    expect(r2.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * day);
  });

  it("denies expired sessions and sessions past the absolute cap", async () => {
    const a = await h.signIn();
    await h.db.session.update({
      where: { id: a.sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await refresh(a.refreshToken)).statusCode).toBe(401);
    const b = await h.signIn();
    await h.db.session.update({
      where: { id: b.sessionId },
      data: { absoluteExpiresAt: new Date(Date.now() - 1000) },
    });
    expect((await refresh(b.refreshToken)).statusCode).toBe(401);
    expect((await refresh("n".repeat(43))).statusCode).toBe(401);
  });
});

describe("logout and sessions", () => {
  it("logout ends the current session immediately", async () => {
    const s = await h.signIn();
    expect((await h.call("POST", "/auth/logout", { token: s.accessToken })).statusCode).toBe(200);
    expect((await h.call("GET", "/me", { token: s.accessToken })).statusCode).toBe(401);
    expect((await refresh(s.refreshToken)).statusCode).toBe(401);
  });

  it("logout-all ends every session of the user only", async () => {
    const a = await h.signIn();
    const a2 = (await h.login(a.email, a.password)).json();
    const other = await h.signIn();
    expect((await h.call("POST", "/auth/logout-all", { token: a.accessToken })).statusCode).toBe(
      200,
    );
    expect((await h.call("GET", "/me", { token: a2.accessToken })).statusCode).toBe(401);
    expect((await h.call("GET", "/me", { token: other.accessToken })).statusCode).toBe(200);
  });

  it("lists only the caller's active sessions and marks the current one", async () => {
    const a = await h.signIn();
    await h.call("POST", "/auth/login", {
      body: { email: a.email, password: a.password, deviceLabel: "Pixel 9" },
    });
    const other = await h.signIn();
    const res = await h.call("GET", "/me/sessions", { token: a.accessToken });
    const list = res.json() as { id: string; current: boolean; deviceLabel: string | null }[];
    expect(list).toHaveLength(2);
    expect(list.filter((s) => s.current).map((s) => s.id)).toEqual([a.sessionId]);
    expect(list.some((s) => s.deviceLabel === "Pixel 9")).toBe(true);
    expect(list.some((s) => s.id === other.sessionId)).toBe(false);
    expect(res.body).not.toMatch(/refresh|hash|token/i);
  });

  it("revokes one of your own sessions and treats another user's as not found", async () => {
    const a = await h.signIn();
    const second = (await h.login(a.email, a.password)).json();
    const victim = await h.signIn();
    const notMine = await h.call("DELETE", `/me/sessions/${victim.sessionId}`, {
      token: a.accessToken,
    });
    expect(notMine.statusCode).toBe(404);
    expect((await h.call("GET", "/me", { token: victim.accessToken })).statusCode).toBe(200);
    expect(
      (await h.call("DELETE", `/me/sessions/${second.sessionId}`, { token: a.accessToken }))
        .statusCode,
    ).toBe(200);
    expect((await h.call("GET", "/me", { token: second.accessToken })).statusCode).toBe(401);
    expect(
      (await h.call("DELETE", "/me/sessions/not-a-uuid", { token: a.accessToken })).statusCode,
    ).toBe(400);
  });
});

it("registers with the default password constant", () => {
  expect(GOOD_PASSWORD.length).toBeGreaterThan(10);
});
