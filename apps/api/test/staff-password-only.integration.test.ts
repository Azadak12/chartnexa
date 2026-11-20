import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PasswordService } from "../src/modules/identity/index.js";
import { makeHarness, type Harness, GOOD_PASSWORD } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let passwordOnly: Harness;
let strict: Harness;
let drop: () => Promise<void>;
beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  const hosted = {
    NODE_ENV: "production",
    MFA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
    MAILER_DRIVER: "resend",
    RESEND_API_KEY: "test-unused",
    MAIL_FROM: "test@example.com",
    STORAGE_DRIVER: "postgres",
    VIDEO_PROVIDER: "direct",
    PAYMENT_PROVIDER: "disabled",
    SCANNER: "none",
    FILE_UPLOADS: "disabled",
  };
  passwordOnly = await makeHarness(db.url, { ...hosted, STAFF_MFA_REQUIRED: "false" });
  strict = await makeHarness(db.url, hosted);
  const hash = await passwordOnly.t.app.get(PasswordService).hash(GOOD_PASSWORD);
  for (const role of ["admin", "manager", "student"] as const) {
    await passwordOnly.db.user.create({
      data: {
        email: `${role}@policy.test`,
        emailNormalized: `${role}@policy.test`,
        passwordHash: hash,
        emailVerifiedAt: new Date(),
        ...(role !== "student" ? { roles: { create: { role, reason: "test" } } } : {}),
      },
    });
  }
});
afterAll(async () => {
  await passwordOnly?.t.app.close();
  await strict?.t.app.close();
  await drop?.();
});

describe("production staff password-only policy", () => {
  it.each(["admin", "manager"])(
    "signs in %s without setup while retaining identity and permissions",
    async (role) => {
      const login = await passwordOnly.login(`${role}@policy.test`, GOOD_PASSWORD);
      expect(login.statusCode).toBe(200);
      const token = login.json().accessToken as string;
      expect(token).toBeTruthy();
      expect(login.json().challengeToken).toBeUndefined();
      expect((await passwordOnly.call("GET", "/me/mfa", { token })).json().required).toBe(false);
      expect((await passwordOnly.call("GET", "/me/access", { token })).json().roles).toContain(
        role,
      );
      expect((await passwordOnly.call("GET", "/staff/audit-events", { token })).statusCode).toBe(
        role === "admin" ? 200 : 403,
      );
      expect(
        (await passwordOnly.login(`${role}@policy.test`, "wrong-password-123")).statusCode,
      ).toBe(401);
      expect((await strict.login(`${role}@policy.test`, GOOD_PASSWORD)).json().status).toBe(
        "mfa_setup_required",
      );
    },
  );
  it("does not grant student staff access", async () => {
    const token = (await passwordOnly.login("student@policy.test", GOOD_PASSWORD)).json()
      .accessToken as string;
    expect((await passwordOnly.call("GET", "/staff/courses", { token })).statusCode).toBe(403);
    expect((await passwordOnly.call("GET", "/staff/audit-events")).statusCode).toBe(401);
  });
});
