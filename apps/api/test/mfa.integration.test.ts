import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  loginResponseSchema,
  mfaChallengeSchema,
  type MfaChallenge,
  type MfaSetupCompleteResponse,
  type MfaSetupStartResponse,
  type MfaSignInResponse,
  type MfaStatus,
} from "@chartnexa/api-contracts";
import { runBootstrap } from "../src/cli/admin-bootstrap.js";
import { MfaService } from "../src/modules/mfa/index.js";
import { DEV_MFA_KEY, parseKey, seal } from "../src/modules/mfa/secret-box.js";
import { codeForStep, newSecret, stepAt } from "../src/modules/mfa/totp.js";
import { auditRows, giveRole, person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let dbUrl: string;
let drop: () => Promise<void>;
let admin: Person;

beforeAll(async () => {
  const db = await createIsolatedDb();
  dbUrl = db.url;
  drop = db.drop;
  h = await makeHarness(db.url);
  admin = await person(h, "admin"); // a session from before the role: no second step yet
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

const KEY = parseKey(DEV_MFA_KEY) as Buffer;
const nowStep = () => stepAt(Date.now());
const post = (path: string, body: unknown, token?: string) =>
  h.call("POST", path, { body, ...(token ? { token } : {}) });
const login = (p: { email: string; password: string }) => h.login(p.email, p.password);
const challengeOf = async (p: { email: string; password: string }) => {
  const res = await login(p);
  expect(res.statusCode).toBe(200);
  return res.json() as MfaChallenge;
};

/** A verified account holding the given staff role, signed in only before the role was given. */
const staff = async (role: "admin" | "manager" | "instructor" | undefined) => {
  const p = await person(h);
  if (role) await giveRole(h, p.id, role);
  return p;
};
/** Turns two-step sign-in on directly in the database, with a secret the test knows. */
const enrolled = async (role: "admin" | "manager" = "manager") => {
  const p = await staff(role);
  const secret = newSecret();
  const s = seal(secret, KEY);
  await h.db.mfaCredential.create({
    data: { userId: p.id, secretCiphertext: s.ciphertext, secretIv: s.iv, secretTag: s.tag },
  });
  return { p, secret };
};
const verify = (token: string, code: string) =>
  post("/auth/mfa/verify", { challengeToken: token, code });
const sessionsOf = (userId: string) => h.db.session.count({ where: { userId } });

/** Goes through the real setup: password, start, first code. Returns what the app would hold. */
const enrollThroughApi = async (p: { email: string; password: string; id: string }) => {
  const ch = await challengeOf(p);
  expect(ch.status).toBe("mfa_setup_required");
  const started = (
    await post("/auth/mfa/setup/start", { challengeToken: ch.challengeToken })
  ).json() as MfaSetupStartResponse;
  const done = await post("/auth/mfa/setup/complete", {
    challengeToken: ch.challengeToken,
    code: codeForStep(started.secret, nowStep()),
  });
  expect(done.statusCode).toBe(200);
  return {
    secret: started.secret,
    ...(done.json() as MfaSetupCompleteResponse),
    challengeToken: ch.challengeToken,
  };
};

describe("a password alone is not enough for Admins and Managers", () => {
  it("answers an enrolled Manager with a verify challenge and no tokens", async () => {
    const { p } = await enrolled("manager");
    const res = await login(p);
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body).toMatchObject({ status: "mfa_required", expiresInSeconds: 300 });
    expect(body).not.toHaveProperty("accessToken");
    expect(body).not.toHaveProperty("refreshToken");
    expect(loginResponseSchema.safeParse(body).success).toBe(true);
    expect(await sessionsOf(p.id)).toBe(1); // only the one from before the role
  });

  it("answers an Admin who has not enrolled with a setup challenge and no tokens", async () => {
    const p = await staff("admin");
    const body = (await login(p)).json() as Record<string, unknown>;
    expect(body).toMatchObject({ status: "mfa_setup_required" });
    expect(body).not.toHaveProperty("accessToken");
  });

  it("signs Students and Instructors in as before", async () => {
    for (const role of [undefined, "instructor"] as const) {
      const p = await staff(role);
      const body = (await login(p)).json() as Record<string, unknown>;
      expect(body).toHaveProperty("accessToken");
      expect(body).not.toHaveProperty("status");
    }
  });

  it("gives a wrong password the usual failure and creates no challenge", async () => {
    const { p } = await enrolled();
    const res = await h.login(p.email, "definitely-wrong-password");
    expect(res.statusCode).toBe(401);
    expect(await h.db.mfaChallenge.count({ where: { userId: p.id } })).toBe(0);
  });

  it("signs a person in normally once their staff role has ended", async () => {
    const { p } = await enrolled();
    await h.db.userRole.updateMany({
      where: { userId: p.id },
      data: { revokedAt: new Date(), revokeReason: "test" },
    });
    expect(await login(p).then((r) => r.json())).toHaveProperty("accessToken");
  });
});

describe("challenges", () => {
  it("are stored only as a hash and expire", async () => {
    const { p, secret } = await enrolled();
    const ch = await challengeOf(p);
    const row = await h.db.mfaChallenge.findFirstOrThrow({ where: { userId: p.id } });
    expect(row.tokenHash).not.toContain(ch.challengeToken);
    expect(row.tokenHash).not.toBe(ch.challengeToken);
    await h.db.mfaChallenge.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await verify(ch.challengeToken, codeForStep(secret, nowStep()));
    expect(res.statusCode).toBe(401);
    expect(await sessionsOf(p.id)).toBe(1);
  });

  it("work once", async () => {
    const { p, secret } = await enrolled();
    const ch = await challengeOf(p);
    const code = codeForStep(secret, nowStep());
    expect((await verify(ch.challengeToken, code)).statusCode).toBe(200);
    expect((await verify(ch.challengeToken, codeForStep(secret, nowStep() + 1))).statusCode).toBe(
      401,
    );
    expect(await sessionsOf(p.id)).toBe(2);
  });

  it("let exactly one of several simultaneous attempts through", async () => {
    const { p, secret } = await enrolled();
    const ch = await challengeOf(p);
    const code = codeForStep(secret, nowStep());
    const results = await Promise.all(
      Array.from({ length: 5 }, () => verify(ch.challengeToken, code)),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(await sessionsOf(p.id)).toBe(2);
  });

  it("are replaced by a newer sign-in", async () => {
    const { p, secret } = await enrolled();
    const first = await challengeOf(p);
    const second = await challengeOf(p);
    expect((await verify(first.challengeToken, codeForStep(secret, nowStep()))).statusCode).toBe(
      401,
    );
    expect((await verify(second.challengeToken, codeForStep(secret, nowStep()))).statusCode).toBe(
      200,
    );
  });

  it("die after five wrong codes, even for the right one", async () => {
    const { p, secret } = await enrolled();
    const ch = await challengeOf(p);
    for (let i = 0; i < 5; i++)
      expect((await verify(ch.challengeToken, "000000")).statusCode).toBe(401);
    expect(await h.db.mfaChallenge.count({ where: { userId: p.id } })).toBe(0);
    expect((await verify(ch.challengeToken, codeForStep(secret, nowStep()))).statusCode).toBe(401);
    expect(await sessionsOf(p.id)).toBe(1);
  });

  it("do not work on the wrong endpoint", async () => {
    const setupFor = await staff("admin");
    const setup = await challengeOf(setupFor);
    expect((await verify(setup.challengeToken, "123456")).statusCode).toBe(401);
    const { p } = await enrolled();
    const ver = await challengeOf(p);
    expect(
      (await post("/auth/mfa/setup/start", { challengeToken: ver.challengeToken })).statusCode,
    ).toBe(401);
  });

  it("stop working when the account is disabled between the two steps", async () => {
    const { p, secret } = await enrolled();
    const ch = await challengeOf(p);
    await h.db.user.update({ where: { id: p.id }, data: { status: "disabled" } });
    expect((await verify(ch.challengeToken, codeForStep(secret, nowStep()))).statusCode).toBe(401);
    expect(await sessionsOf(p.id)).toBe(1);
  });

  it("give no staff powers when the role ended between the two steps", async () => {
    const { p, secret } = await enrolled();
    const ch = await challengeOf(p);
    await h.db.userRole.updateMany({
      where: { userId: p.id },
      data: { revokedAt: new Date(), revokeReason: "test" },
    });
    const res = await verify(ch.challengeToken, codeForStep(secret, nowStep()));
    expect(res.statusCode).toBe(200);
    const tokens = res.json() as MfaSignInResponse;
    expect(
      (await h.call("GET", "/staff/audit-events", { token: tokens.accessToken })).statusCode,
    ).toBe(403);
  });
});

describe("authenticator codes", () => {
  it("sign in once and remember the step", async () => {
    const { p, secret } = await enrolled();
    const ch = await challengeOf(p);
    const res = await verify(ch.challengeToken, codeForStep(secret, nowStep()));
    expect(res.statusCode).toBe(200);
    const tokens = res.json() as MfaSignInResponse;
    expect(tokens.recoveryCodesRemaining).toBeNull();
    expect((await h.call("GET", "/me", { token: tokens.accessToken })).statusCode).toBe(200);
    const cred = await h.db.mfaCredential.findUniqueOrThrow({ where: { userId: p.id } });
    expect(cred.lastUsedStep).toBe(BigInt(nowStep()));
  });

  it("cannot be used again for a new challenge, but the next step works", async () => {
    const { p, secret } = await enrolled();
    const code = codeForStep(secret, nowStep());
    expect((await verify((await challengeOf(p)).challengeToken, code)).statusCode).toBe(200);
    expect((await verify((await challengeOf(p)).challengeToken, code)).statusCode).toBe(401);
    expect(
      (await verify((await challengeOf(p)).challengeToken, codeForStep(secret, nowStep() + 1)))
        .statusCode,
    ).toBe(200);
  });

  it("allow one step of clock drift either way and refuse two", async () => {
    // Each case gets its own account so one accepted code cannot affect another.
    for (const [offset, accepted] of [
      [-1, true],
      [0, true],
      [1, true],
      [-2, false],
      [2, false],
      [-10, false],
    ] as const) {
      const { p, secret } = await enrolled();
      const ch = await challengeOf(p);
      const res = await verify(ch.challengeToken, codeForStep(secret, nowStep() + offset));
      expect(res.statusCode, `step offset ${offset}`).toBe(accepted ? 200 : 401);
    }
  });

  it("refuse wrong and malformed codes with one generic answer, and count them", async () => {
    const { p, secret } = await enrolled();
    const ch = await challengeOf(p);
    const answers = new Set<string>();
    for (const code of ["000000", "12345", "abcdef", "1234567", "'; DROP TABLE users;--"]) {
      const res = await verify(ch.challengeToken, code);
      expect([400, 401]).toContain(res.statusCode);
      if (res.statusCode === 401)
        answers.add(JSON.stringify((res.json() as { message: string }).message));
    }
    expect(answers.size).toBe(1);
    const expired = await verify("unknown-challenge-token-0000", codeForStep(secret, nowStep()));
    expect(answers.has(JSON.stringify((expired.json() as { message: string }).message))).toBe(true);
    const row = await h.db.mfaChallenge.findFirst({ where: { userId: p.id } });
    expect(row?.attempts ?? 5).toBeGreaterThanOrEqual(2);
  });

  it("are limited per person across many challenges", async () => {
    const { p } = await enrolled();
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const ch = await challengeOf(p);
      last = (await verify(ch.challengeToken, "000000")).statusCode;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });
});

describe("enrollment", () => {
  it("proves the first code, turns it on, and returns 10 recovery codes once", async () => {
    const p = await staff("manager");
    const out = await enrollThroughApi(p);
    expect(out.recoveryCodes).toHaveLength(10);
    for (const c of out.recoveryCodes) expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(new Set(out.recoveryCodes).size).toBe(10);
    expect((await h.call("GET", "/me", { token: out.accessToken })).statusCode).toBe(200);
    const cred = await h.db.mfaCredential.findUniqueOrThrow({ where: { userId: p.id } });
    expect(cred.secretCiphertext).not.toContain(out.secret);
    const stored = (await h.db.mfaRecoveryCode.findMany({ where: { userId: p.id } })).map(
      (r) => r.codeHash,
    );
    expect(stored).toHaveLength(10);
    for (const c of out.recoveryCodes) {
      expect(stored).not.toContain(c);
      expect(stored).not.toContain(c.replaceAll("-", ""));
    }
    const rows = await auditRows(h, { targetId: p.id, action: "mfa.enroll" });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain(out.secret);
    const status = (await h.call("GET", "/me/mfa", { token: out.accessToken })).json() as MfaStatus;
    expect(status).toEqual({ required: true, enabled: true, recoveryCodesRemaining: 10 });
  });

  it("enables nothing until the first code is proven, and the next sign-in starts over", async () => {
    const p = await staff("manager");
    const ch = await challengeOf(p);
    const started = (
      await post("/auth/mfa/setup/start", { challengeToken: ch.challengeToken })
    ).json() as MfaSetupStartResponse;
    expect(started.otpauthUri).toContain("otpauth://totp/");
    const row = await h.db.mfaChallenge.findFirstOrThrow({ where: { userId: p.id } });
    expect(row.pendingCiphertext).not.toContain(started.secret);
    expect(await h.db.mfaCredential.count({ where: { userId: p.id } })).toBe(0);
    const wrong = await post("/auth/mfa/setup/complete", {
      challengeToken: ch.challengeToken,
      code: "000000",
    });
    expect(wrong.statusCode).toBe(401);
    expect(await h.db.mfaCredential.count({ where: { userId: p.id } })).toBe(0);
    expect((await challengeOf(p)).status).toBe("mfa_setup_required");
  });

  it("refuses to complete without starting, and with a code from a different secret", async () => {
    const p = await staff("manager");
    const ch = await challengeOf(p);
    expect(
      (
        await post("/auth/mfa/setup/complete", {
          challengeToken: ch.challengeToken,
          code: codeForStep(newSecret(), nowStep()),
        })
      ).statusCode,
    ).toBe(401);
    await post("/auth/mfa/setup/start", { challengeToken: ch.challengeToken });
    expect(
      (
        await post("/auth/mfa/setup/complete", {
          challengeToken: ch.challengeToken,
          code: codeForStep(newSecret(), nowStep()),
        })
      ).statusCode,
    ).toBe(401);
    expect(await h.db.mfaCredential.count({ where: { userId: p.id } })).toBe(0);
  });

  it("refuses a setup for someone who already has two-step sign-in, leaving their secret alone", async () => {
    const { p } = await enrolled();
    const before = await h.db.mfaCredential.findUniqueOrThrow({ where: { userId: p.id } });
    const token = "setup-token-for-an-enrolled-person-000000";
    const { hashToken } = await import("../src/modules/identity/index.js");
    await h.db.mfaChallenge.create({
      data: {
        userId: p.id,
        kind: "setup",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    expect((await post("/auth/mfa/setup/start", { challengeToken: token })).statusCode).toBe(409);
    const after = await h.db.mfaCredential.findUniqueOrThrow({ where: { userId: p.id } });
    expect(after.secretCiphertext).toBe(before.secretCiphertext);
  });

  it("refuses the second of two simultaneous enrollments", async () => {
    const p = await staff("manager");
    const ch = await challengeOf(p);
    const started = (
      await post("/auth/mfa/setup/start", { challengeToken: ch.challengeToken })
    ).json() as MfaSetupStartResponse;
    const code = codeForStep(started.secret, nowStep());
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        post("/auth/mfa/setup/complete", { challengeToken: ch.challengeToken, code }),
      ),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(await h.db.mfaCredential.count({ where: { userId: p.id } })).toBe(1);
    expect(await h.db.mfaRecoveryCode.count({ where: { userId: p.id } })).toBe(10);
  });
});

describe("recovery codes", () => {
  it("sign in once, say how many remain, and are audited without the code", async () => {
    const p = await staff("manager");
    const { recoveryCodes } = await enrollThroughApi(p);
    const code = recoveryCodes[0]!;
    const ch = await challengeOf(p);
    const typed = ` ${code.toUpperCase().replaceAll("-", " ")} `;
    const res = await verify(ch.challengeToken, typed);
    expect(res.statusCode).toBe(200);
    expect((res.json() as MfaSignInResponse).recoveryCodesRemaining).toBe(9);
    const rows = await auditRows(h, { targetId: p.id, action: "mfa.recovery_used" });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain(code.replaceAll("-", ""));
    const again = await verify((await challengeOf(p)).challengeToken, code);
    expect(again.statusCode).toBe(401);
    expect(await auditRows(h, { targetId: p.id, action: "mfa.recovery_used" })).toHaveLength(1);
  });

  it("refuse unknown codes like wrong authenticator codes", async () => {
    const p = await staff("manager");
    await enrollThroughApi(p);
    const ch = await challengeOf(p);
    expect((await verify(ch.challengeToken, "abcd-efgh-jkmn")).statusCode).toBe(401);
    expect((await verify(ch.challengeToken, "iiii-llll-oooo")).statusCode).toBe(401);
  });

  it("are consumed by exactly one of several simultaneous attempts", async () => {
    const p = await staff("manager");
    const { recoveryCodes } = await enrollThroughApi(p);
    const ch = await challengeOf(p);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => verify(ch.challengeToken, recoveryCodes[1]!)),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(
      await h.db.mfaRecoveryCode.count({ where: { userId: p.id, usedAt: { not: null } } }),
    ).toBe(1);
  });

  it("can be regenerated with the password and a current code, which ends the old set", async () => {
    const p = await staff("manager");
    const out = await enrollThroughApi(p);
    const next = codeForStep(out.secret, nowStep() + 1);
    const res = await post(
      "/me/mfa/recovery-codes",
      { password: p.password, code: next },
      out.accessToken,
    );
    expect(res.statusCode).toBe(200);
    const fresh = (res.json() as { recoveryCodes: string[] }).recoveryCodes;
    expect(fresh).toHaveLength(10);
    expect(fresh.some((c) => out.recoveryCodes.includes(c))).toBe(false);
    expect(
      (await verify((await challengeOf(p)).challengeToken, out.recoveryCodes[2]!)).statusCode,
    ).toBe(401);
    expect((await verify((await challengeOf(p)).challengeToken, fresh[2]!)).statusCode).toBe(200);
    expect(await auditRows(h, { targetId: p.id, action: "mfa.recovery_regenerate" })).toHaveLength(
      1,
    );
  });

  it("are not regenerated with a wrong password, a wrong or reused code, or by someone without two-step", async () => {
    const p = await staff("manager");
    const out = await enrollThroughApi(p);
    const ok = codeForStep(out.secret, nowStep() + 1);
    expect(
      (
        await post(
          "/me/mfa/recovery-codes",
          { password: "wrong-password-value", code: ok },
          out.accessToken,
        )
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await post(
          "/me/mfa/recovery-codes",
          { password: p.password, code: "000000" },
          out.accessToken,
        )
      ).statusCode,
    ).toBe(401);
    expect(
      (await post("/me/mfa/recovery-codes", { password: p.password, code: ok }, out.accessToken))
        .statusCode,
    ).toBe(200);
    expect(
      (await post("/me/mfa/recovery-codes", { password: p.password, code: ok }, out.accessToken))
        .statusCode,
    ).toBe(401);
    const student = await person(h);
    expect(
      (
        await post(
          "/me/mfa/recovery-codes",
          { password: student.password, code: "123456" },
          student.accessToken,
        )
      ).statusCode,
    ).toBe(401);
    expect(
      (await post("/me/mfa/recovery-codes", { password: p.password, code: ok })).statusCode,
    ).toBe(401);
  });
});

describe("lost device", () => {
  it("lets an Admin reset a Manager: sessions end and setup is needed again", async () => {
    const p = await staff("manager");
    const out = await enrollThroughApi(p);
    const adminLogin = (await enrollThroughApi(await staff("admin"))) as MfaSetupCompleteResponse;
    const res = await post(
      `/staff/users/${p.id}/mfa/reset`,
      { reason: "Lost the phone" },
      adminLogin.accessToken,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ reset: true });
    expect((await h.call("GET", "/me", { token: out.accessToken })).statusCode).toBe(401);
    expect(await h.db.mfaCredential.count({ where: { userId: p.id } })).toBe(0);
    expect(await h.db.mfaRecoveryCode.count({ where: { userId: p.id } })).toBe(0);
    expect((await challengeOf(p)).status).toBe("mfa_setup_required");
    const rows = await auditRows(h, { targetId: p.id, action: "mfa.reset" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: "Lost the phone" });
  });

  it("is for Admins only, never for yourself, and answers 404 for nobody", async () => {
    const target = await staff("manager");
    await enrollThroughApi(target);
    const me = await enrollThroughApi(await staff("admin"));
    const manager = await enrollThroughApi(await staff("manager"));
    const instr = await person(h, "instructor");
    const student = await person(h);
    const url = `/staff/users/${target.id}/mfa/reset`;
    for (const t of [manager.accessToken, instr.accessToken, student.accessToken]) {
      expect((await post(url, { reason: "Not allowed" }, t)).statusCode).toBe(403);
    }
    expect((await post(url, { reason: "No sign-in" })).statusCode).toBe(401);
    expect(await h.db.mfaCredential.count({ where: { userId: target.id } })).toBe(1);
    const selfId = (await h.db.session.findUniqueOrThrow({ where: { id: me.sessionId } })).userId;
    expect(
      (await post(`/staff/users/${selfId}/mfa/reset`, { reason: "Myself" }, me.accessToken))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await post(
          "/staff/users/00000000-0000-4000-8000-000000000000/mfa/reset",
          { reason: "Nobody" },
          me.accessToken,
        )
      ).statusCode,
    ).toBe(404);
    expect((await post(url, { reason: "ab" }, me.accessToken)).statusCode).toBe(400);
  });

  it("does nothing, and writes no audit record, for someone without two-step sign-in", async () => {
    const target = await staff(undefined);
    const me = await enrollThroughApi(await staff("admin"));
    const res = await post(
      `/staff/users/${target.id}/mfa/reset`,
      { reason: "Nothing to reset" },
      me.accessToken,
    );
    expect(res.json()).toEqual({ reset: false });
    expect(await auditRows(h, { targetId: target.id, action: "mfa.reset" })).toHaveLength(0);
  });

  it("can be done by the operator for a locked-out sole Admin, as a system action", async () => {
    const p = await staff("admin");
    await enrollThroughApi(p);
    const env = {
      DATABASE_URL: dbUrl,
      CURSOR_SECRET: "c".repeat(32),
      ACCESS_TOKEN_SECRET: "a".repeat(32),
      MAILER_DRIVER: "memory",
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    };
    const result = await runBootstrap(["--email", p.email.toLowerCase(), "--reset-mfa"], env);
    expect(result).toMatchObject({ exitCode: 0 });
    expect(await h.db.mfaCredential.count({ where: { userId: p.id } })).toBe(0);
    expect((await challengeOf(p)).status).toBe("mfa_setup_required");
    const row = await h.db.auditEvent.findFirstOrThrow({
      where: { targetId: p.id, action: "mfa.reset" },
    });
    expect(row).toMatchObject({ actorKind: "system", reason: "operator_reset" });
    expect(
      (await runBootstrap(["--email", "nobody@example.com", "--reset-mfa"], env)).exitCode,
    ).toBe(1);
    expect(
      (await runBootstrap(["--email", p.email, "--reset-mfa", "--recovery"], env)).exitCode,
    ).toBe(1);
  });
});

describe("rollout and role changes", () => {
  it("ends a Student's open session when they become a Manager, and the next sign-in is setup", async () => {
    const p = await person(h);
    expect((await h.call("GET", "/me", { token: p.accessToken })).statusCode).toBe(200);
    const res = await h.call("PUT", `/staff/users/${p.id}/role`, {
      token: admin.accessToken,
      body: { role: "manager", reason: "Joins operations" },
    });
    expect(res.statusCode).toBe(200);
    expect((await h.call("GET", "/me", { token: p.accessToken })).statusCode).toBe(401);
    expect((await challengeOf(p)).status).toBe("mfa_setup_required");
  });

  it("leaves an Instructor's sessions alone", async () => {
    const p = await person(h);
    const res = await h.call("PUT", `/staff/users/${p.id}/role`, {
      token: admin.accessToken,
      body: { role: "instructor", reason: "Teaches" },
    });
    expect(res.statusCode).toBe(200);
    expect((await h.call("GET", "/me", { token: p.accessToken })).statusCode).toBe(200);
  });
});

describe("account deletion", () => {
  it("removes the person's second step", async () => {
    const p = await staff("manager");
    const out = await enrollThroughApi(p);
    // A Manager may delete their account; the role ends in the same transaction.
    const res = await h.call("DELETE", "/me", {
      token: out.accessToken,
      body: { password: p.password },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(await h.db.mfaCredential.count({ where: { userId: p.id } })).toBe(0);
    expect(await h.db.mfaRecoveryCode.count({ where: { userId: p.id } })).toBe(0);
  });

  it("is cancelled when removing it fails", async () => {
    const p = await staff("manager");
    const out = await enrollThroughApi(p);
    const spy = vi
      .spyOn(h.t.app.get(MfaService), "deleteForAccount")
      .mockRejectedValue(new Error("down"));
    try {
      const res = await h.call("DELETE", "/me", {
        token: out.accessToken,
        body: { password: p.password },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    } finally {
      spy.mockRestore();
    }
    expect(await h.db.mfaCredential.count({ where: { userId: p.id } })).toBe(1);
    expect((await h.db.user.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("active");
  });
});

describe("secrets stay secret", () => {
  it("never appear in logs, audit rows or errors across every flow", async () => {
    const p = await staff("manager");
    const out = await enrollThroughApi(p);
    const ch = await challengeOf(p);
    const wrong = await verify(ch.challengeToken, "000000");
    const used = await verify((await challengeOf(p)).challengeToken, out.recoveryCodes[0]!);
    await post(
      "/me/mfa/recovery-codes",
      { password: p.password, code: codeForStep(out.secret, nowStep() + 1) },
      (used.json() as MfaSignInResponse).accessToken,
    );
    const secrets = [
      out.secret,
      ch.challengeToken,
      ...out.recoveryCodes,
      ...out.recoveryCodes.map((c) => c.replaceAll("-", "")),
      p.password,
    ];
    const logs = h.t.logs();
    const audits = JSON.stringify(
      await h.db.auditEvent.findMany({
        where: { OR: [{ targetId: p.id }, { actorUserId: p.id }] },
      }),
    );
    for (const s of secrets) {
      expect(logs, `logs hold ${s.slice(0, 4)}`).not.toContain(s);
      expect(audits, `audit holds ${s.slice(0, 4)}`).not.toContain(s);
      expect(JSON.stringify(wrong.json())).not.toContain(s);
    }
    expect(logs.toLowerCase()).not.toContain(p.email.toLowerCase());
  });

  it("are unusable from the database alone", async () => {
    const { p, secret } = await enrolled();
    const cred = await h.db.mfaCredential.findUniqueOrThrow({ where: { userId: p.id } });
    expect(cred.secretCiphertext).not.toContain(secret);
    expect(mfaChallengeSchema.safeParse({}).success).toBe(false);
  });
});
