import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { errorEnvelopeSchema } from "@chartnexa/api-contracts";
import {
  freshEmail,
  freshIp,
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

describe("registration", () => {
  it("creates an account, emails a verification token and leaks no secrets", async () => {
    const email = freshEmail();
    const res = await h.call("POST", "/auth/register", {
      body: { email, password: GOOD_PASSWORD },
    });
    expect(res.statusCode).toBe(202);
    expect(res.body).not.toContain(GOOD_PASSWORD);
    expect(res.body).not.toContain("argon2");
    const user = await h.db.user.findUniqueOrThrow({
      where: { emailNormalized: email.toLowerCase() },
    });
    expect(user.email).toBe(email.toLowerCase());
    expect(user.passwordHash?.startsWith("$argon2id$")).toBe(true);
    expect(h.mailer.last(email.toLowerCase(), "verify_email")).toBeDefined();
  });

  it("rejects weak passwords with a field-level error", async () => {
    const email = freshEmail();
    for (const password of ["short", "x".repeat(129), email.toLowerCase(), "Password123"]) {
      const res = await h.call("POST", "/auth/register", { body: { email, password } });
      expect(res.statusCode, password.slice(0, 12)).toBe(400);
      const body = errorEnvelopeSchema.parse(res.json());
      expect(body.fields?.some((f) => f.field === "password")).toBe(true);
    }
    expect(await h.db.user.count({ where: { emailNormalized: email.toLowerCase() } })).toBe(0);
  });

  it("creates exactly one account for concurrent registrations differing only in case", async () => {
    const base = `race-${Date.now()}@example.com`;
    const results = await Promise.all([
      h.call("POST", "/auth/register", { body: { email: base, password: GOOD_PASSWORD } }),
      h.call("POST", "/auth/register", {
        body: { email: base.toUpperCase(), password: GOOD_PASSWORD },
      }),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([202, 202]);
    expect(await h.db.user.count({ where: { emailNormalized: base } })).toBe(1);
  });

  it("rejects two live accounts with one email at the database level", async () => {
    const email = `db-${Date.now()}@example.com`;
    await h.db.user.create({ data: { email, emailNormalized: email } });
    await expect(
      h.db.user.create({ data: { email, emailNormalized: email } }),
    ).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("answers an existing email exactly like a new one and warns the owner", async () => {
    const { email } = await h.register();
    h.mailer.clear();
    const fresh = await h.call("POST", "/auth/register", {
      body: { email: freshEmail(), password: GOOD_PASSWORD },
    });
    const dup = await h.call("POST", "/auth/register", {
      body: { email, password: GOOD_PASSWORD },
    });
    expect(
      stripRequestId({ ...dup, json: () => ({ ...dup.json(), requestId: "" }) } as typeof dup),
    ).toEqual(
      stripRequestId({
        ...fresh,
        json: () => ({ ...fresh.json(), requestId: "" }),
      } as typeof fresh),
    );
    expect(h.mailer.last(email.toLowerCase(), "registration_attempt")).toBeDefined();
  });
});

describe("email verification", () => {
  it("verifies once and rejects reuse, unknown and expired tokens with one generic error", async () => {
    const { email, password } = await h.register();
    const token = h.tokenFor(email, "verify_email");
    const ok = await h.call("POST", "/auth/email/verify", { body: { token } });
    expect(ok.statusCode).toBe(200);
    const me = await h.call("GET", "/me", {
      token: (await h.login(email, password)).json().accessToken,
    });
    expect(me.json().emailVerified).toBe(true);

    const reuse = await h.call("POST", "/auth/email/verify", { body: { token } });
    const unknown = await h.call("POST", "/auth/email/verify", { body: { token: "u".repeat(43) } });
    const other = await h.register();
    const expiring = h.tokenFor(other.email, "verify_email");
    await h.db.oneTimeToken.updateMany({
      where: { user: { emailNormalized: other.email.toLowerCase() } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await h.call("POST", "/auth/email/verify", { body: { token: expiring } });
    const norm = (r: typeof reuse) => stripRequestId(r);
    expect(reuse.statusCode).toBe(400);
    expect(norm(reuse)).toEqual(norm(unknown));
    expect(norm(reuse)).toEqual(norm(expired));
  });

  it("lets only one of two simultaneous redemptions win", async () => {
    const { email } = await h.register();
    const token = h.tokenFor(email, "verify_email");
    const rs = await Promise.all([
      h.call("POST", "/auth/email/verify", { body: { token } }),
      h.call("POST", "/auth/email/verify", { body: { token } }),
    ]);
    expect(rs.map((r) => r.statusCode).sort()).toEqual([200, 400]);
  });

  it("resend invalidates earlier tokens and issues one new token", async () => {
    const s = await h.signIn();
    const first = h.tokenFor(s.email, "verify_email");
    const res = await h.call("POST", "/auth/email/resend", { token: s.accessToken });
    expect(res.statusCode).toBe(202);
    const second = h.tokenFor(s.email, "verify_email");
    expect(second).not.toBe(first);
    expect(
      (await h.call("POST", "/auth/email/verify", { body: { token: first } })).statusCode,
    ).toBe(400);
    expect(
      (await h.call("POST", "/auth/email/verify", { body: { token: second } })).statusCode,
    ).toBe(200);
    h.mailer.clear();
    await h.call("POST", "/auth/email/resend", { token: s.accessToken });
    expect(h.mailer.outbox).toHaveLength(0);
  });
});

describe("profile and guard", () => {
  it("returns only the caller's own account without secrets and updates the display name", async () => {
    const a = await h.signIn();
    const b = await h.signIn();
    const me = await h.call("GET", "/me", { token: a.accessToken });
    expect(me.statusCode).toBe(200);
    expect(Object.keys(me.json()).sort()).toEqual([
      "createdAt",
      "displayName",
      "email",
      "emailVerified",
      "id",
    ]);
    expect(me.json().email).toBe(a.email.toLowerCase());
    const upd = await h.call("PATCH", "/me", {
      token: a.accessToken,
      body: { displayName: "Ann" },
    });
    expect(upd.json().displayName).toBe("Ann");
    expect((await h.call("GET", "/me", { token: b.accessToken })).json().displayName).toBeNull();
    expect(
      (await h.call("PATCH", "/me", { token: a.accessToken, body: { displayName: "" } }))
        .statusCode,
    ).toBe(400);
  });

  it("answers 401 in the envelope without a valid token", async () => {
    const res = await h.call("GET", "/me");
    expect(res.statusCode).toBe(401);
    expect(errorEnvelopeSchema.parse(res.json()).code).toBe("UNAUTHENTICATED");
  });

  it("rejects a disabled account on its next request", async () => {
    const s = await h.signIn();
    expect((await h.call("GET", "/me", { token: s.accessToken })).statusCode).toBe(200);
    await h.db.user.update({
      where: { emailNormalized: s.email.toLowerCase() },
      data: { status: "disabled" },
    });
    expect((await h.call("GET", "/me", { token: s.accessToken })).statusCode).toBe(401);
    expect((await h.login(s.email, s.password)).statusCode).toBe(401);
  });
});

describe("account deletion", () => {
  it("rejects a wrong password and leaves the account unchanged", async () => {
    const s = await h.signIn();
    const res = await h.call("DELETE", "/me", {
      token: s.accessToken,
      body: { password: "not the password" },
    });
    // A wrong confirmation password is a field error, never a 401 (clients treat 401 as "signed out").
    expect(res.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(res.json()).fields?.[0]?.field).toBe("password");
    expect((await h.call("GET", "/me", { token: s.accessToken })).statusCode).toBe(200);
  });

  it("erases personal data, ends sessions and frees the email", async () => {
    const s = await h.signIn();
    const second = await h.login(s.email, s.password);
    const before = await h.db.user.findUniqueOrThrow({
      where: { emailNormalized: s.email.toLowerCase() },
    });
    const res = await h.call("DELETE", "/me", {
      token: s.accessToken,
      body: { password: s.password },
    });
    expect(res.statusCode).toBe(200);
    expect((await h.call("GET", "/me", { token: s.accessToken })).statusCode).toBe(401);
    expect((await h.call("GET", "/me", { token: second.json().accessToken })).statusCode).toBe(401);
    expect((await h.login(s.email, s.password)).statusCode).toBe(401);
    const after = await h.db.user.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toMatchObject({
      email: null,
      emailNormalized: null,
      passwordHash: null,
      displayName: null,
      status: "deleted",
    });
    expect(after.deletedAt).not.toBeNull();
    const again = await h.register({ email: s.email });
    const fresh = await h.db.user.findUniqueOrThrow({
      where: { emailNormalized: again.email.toLowerCase() },
    });
    expect(fresh.id).not.toBe(before.id);
  });
});

it("uses a distinct client address per helper call", () => {
  expect(freshIp()).not.toBe(freshIp());
});
