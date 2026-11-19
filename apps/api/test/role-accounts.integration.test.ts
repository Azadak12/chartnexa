import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyAccountUpdate } from "../src/cli/account-update.js";
import { loadConfig } from "../src/config/config.js";
import { AuditService } from "../src/modules/access/index.js";
import { PasswordService } from "../src/modules/identity/index.js";
import { runDemoSeed } from "../scripts/demo/seed.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";
import { CURSOR_SECRET } from "./support.js";

/**
 * The five test accounts, end to end against a real database: the same seed the phone uses, the
 * same sign-in route, the real permission checks. The development two-step shortcut is on only
 * in the second harness (config refuses it in test and production).
 */
let strict: Harness; // no shortcut: Admin and Manager must complete two-step sign-in
let dev: Harness; // NODE_ENV=development with MFA_DEV_BYPASS=true
let drop: () => Promise<void>;
let dir: string;
let pw: Record<string, string>;
const assetsDir = join(import.meta.dirname, "..", "demo-assets");
const EMAILS = {
  admin: "admin@chartnexa.test",
  manager: "manager@chartnexa.test",
  instructor: "instructor@chartnexa.test",
  lecturer: "lecturer@chartnexa.test",
  student: "student@chartnexa.test",
} as const;
type Who = keyof typeof EMAILS;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  dir = await mkdtemp(join(tmpdir(), "chartnexa-roles-"));
  strict = await makeHarness(db.url, { STORAGE_DIR: join(dir, "storage") });
  const credentialsFile = join(dir, "creds.json");
  await runDemoSeed(strict.t.app, { assetsDir, credentialsFile });
  pw = Object.fromEntries(
    Object.entries(
      (
        JSON.parse(await readFile(credentialsFile, "utf8")) as {
          accounts: Record<string, { password: string }>;
        }
      ).accounts,
    ).map(([email, a]) => [email, a.password]),
  );
  dev = await makeHarness(db.url, {
    STORAGE_DIR: join(dir, "storage"),
    NODE_ENV: "development",
    MFA_DEV_BYPASS: "true",
  });
}, 240_000);
afterAll(async () => {
  await dev.t.app.close();
  await strict.t.app.close();
  await drop();
  await rm(dir, { recursive: true, force: true });
});

const signIn = async (who: Who, h: Harness = dev) => {
  const res = await h.login(EMAILS[who], pw[EMAILS[who]]!);
  expect(res.statusCode).toBe(200);
  const body = res.json() as { accessToken: string };
  expect(body.accessToken).toBeTruthy();
  return body.accessToken;
};
const get = (h: Harness, path: string, token: string) => h.call("GET", path, { token });
const access = async (token: string) =>
  (await get(dev, "/me/access", token)).json() as {
    roles: string[];
    permissions: string[];
    courseGrants: { courseId: string; permissions: string[] }[];
  };

describe("accounts", () => {
  it("has the five accounts, each with a working password, and Instructor and Lecturer as two users with one role", async () => {
    for (const who of Object.keys(EMAILS) as Who[]) expect(pw[EMAILS[who]]).toBeTruthy();
    const users = await dev.db.user.findMany({
      where: { emailNormalized: { in: Object.values(EMAILS) } },
    });
    expect(users).toHaveLength(5);
    expect(new Set(users.map((u) => u.id)).size).toBe(5);
    const roleOf = async (who: Who) =>
      (await access(await signIn(who))).roles.filter((r) => r !== "student").sort();
    expect(await roleOf("instructor")).toEqual(["instructor"]);
    expect(await roleOf("lecturer")).toEqual(["instructor"]);
    expect(await roleOf("manager")).toEqual(["manager"]);
    expect(await roleOf("admin")).toEqual(["admin"]);
    expect(await roleOf("student")).toEqual([]);
  });

  it("runs the seed again without creating duplicates", async () => {
    const before = await dev.db.user.count();
    await runDemoSeed(strict.t.app, { assetsDir, credentialsFile: join(dir, "creds.json") });
    expect(await dev.db.user.count()).toBe(before);
  });
});

describe("signing in", () => {
  it("rejects a wrong password and an unknown email the same way", async () => {
    for (const who of Object.keys(EMAILS) as Who[]) {
      const res = await dev.login(EMAILS[who], "not-the-password-123");
      expect(res.statusCode).toBe(401);
    }
    const unknown = await dev.login("nobody@chartnexa.test", "whatever-password-123");
    const wrong = await dev.login(EMAILS.student, "not-the-password-123");
    expect(unknown.statusCode).toBe(401);
    const strip = (r: { json: () => unknown }) => {
      const body = { ...(r.json() as Record<string, unknown>) };
      delete body["requestId"];
      return body;
    };
    expect(strip(unknown)).toEqual(strip(wrong));
  });

  it("signs in all five with email and password when the development shortcut is on", async () => {
    for (const who of Object.keys(EMAILS) as Who[]) await signIn(who);
  });

  it("still requires two-step sign-in for Admin and Manager when the shortcut is off", async () => {
    for (const who of ["admin", "manager"] as const) {
      const res = await strict.login(EMAILS[who], pw[EMAILS[who]]!);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: expect.stringMatching(/^mfa_/) });
      expect((res.json() as { accessToken?: string }).accessToken).toBeUndefined();
    }
    for (const who of ["instructor", "lecturer", "student"] as const) {
      expect(
        ((await strict.login(EMAILS[who], pw[EMAILS[who]]!)).json() as { accessToken?: string })
          .accessToken,
      ).toBeTruthy();
    }
  });

  it("refuses the shortcut in production and in test, and by default", () => {
    const base = {
      DATABASE_URL: "postgresql://u:p@localhost:5432/x",
      CURSOR_SECRET,
      ACCESS_TOKEN_SECRET: "test-access-secret-test-access-secret",
    };
    expect(() => loadConfig({ ...base, NODE_ENV: "production", MFA_DEV_BYPASS: "true" })).toThrow(
      /two-step shortcut/,
    );
    expect(() => loadConfig({ ...base, NODE_ENV: "test", MFA_DEV_BYPASS: "true" })).toThrow(
      /two-step shortcut/,
    );
    expect(loadConfig({ ...base, NODE_ENV: "development" }).MFA_DEV_BYPASS).toBe(false);
    expect(
      loadConfig({ ...base, NODE_ENV: "development", MFA_DEV_BYPASS: "true" }).MFA_DEV_BYPASS,
    ).toBe(true);
  });

  it("does not show a two-step row to staff while the shortcut is on", async () => {
    const t = await signIn("admin");
    const status = (await get(dev, "/me/mfa", t)).json() as { required: boolean };
    expect(status.required).toBe(false);
  });
});

describe("permissions by account", () => {
  it("gives every account its own identity, with no mixing when switching", async () => {
    for (const who of ["student", "instructor", "lecturer", "manager", "admin"] as const) {
      const t = await signIn(who);
      const me = (await get(dev, "/me", t)).json() as { email: string };
      expect(me.email).toBe(EMAILS[who]);
    }
  });

  it("gives the Lecturer fewer courses than the Instructor, and each only their own grants", async () => {
    const ins = await access(await signIn("instructor"));
    const lec = await access(await signIn("lecturer"));
    expect(ins.courseGrants.length).toBe(5);
    expect(lec.courseGrants.length).toBe(2);
    const insCourses = new Set(ins.courseGrants.map((g) => g.courseId));
    for (const g of lec.courseGrants) expect(insCourses.has(g.courseId)).toBe(true);
    // A course only the Instructor holds: the Lecturer cannot change it, the Instructor can.
    const only = [...insCourses].find((id) => !lec.courseGrants.some((g) => g.courseId === id))!;
    const tLec = await signIn("lecturer");
    const tIns = await signIn("instructor");
    const patch = (t: string) =>
      dev.call("PATCH", `/staff/courses/${only}`, {
        token: t,
        body: { expectedVersion: 99, title: "Hijacked title" },
      });
    expect((await patch(tLec)).statusCode).toBe(403);
    expect((await patch(tIns)).statusCode).not.toBe(403);
  });

  it("limits staff routes by role", async () => {
    const t = {
      student: await signIn("student"),
      instructor: await signIn("instructor"),
      lecturer: await signIn("lecturer"),
      manager: await signIn("manager"),
      admin: await signIn("admin"),
    };
    const status = async (path: string, who: keyof typeof t) =>
      (await get(dev, path, t[who])).statusCode;
    // Staff course list: every staff account, not students.
    expect(await status("/staff/courses", "student")).toBe(403);
    for (const who of ["instructor", "lecturer", "manager", "admin"] as const) {
      expect(await status("/staff/courses", who)).toBe(200);
    }
    // Instructor invitations: Manager and Admin only.
    for (const who of ["student", "instructor", "lecturer"] as const) {
      expect(await status("/staff/instructor-invitations", who)).toBe(403);
    }
    for (const who of ["manager", "admin"] as const) {
      expect(await status("/staff/instructor-invitations", who)).toBe(200);
    }
    // The audit log: Admin only.
    for (const who of ["student", "instructor", "lecturer", "manager"] as const) {
      expect(await status("/staff/audit-events", who)).toBe(403);
    }
    expect(await status("/staff/audit-events", "admin")).toBe(200);
    // Everyone signed in can read their own learning.
    for (const who of Object.keys(t) as (keyof typeof t)[]) {
      expect(await status("/me/courses", who)).toBe(200);
    }
    // Signed out: nothing protected.
    for (const path of ["/me/courses", "/staff/courses", "/me/access"]) {
      expect((await dev.call("GET", path, {})).statusCode).toBe(401);
    }
  });

  it("keeps the Student's data to the Student", async () => {
    const stud = (await get(dev, "/me/courses", await signIn("student"))).json() as {
      items: unknown[];
    };
    const lec = (await get(dev, "/me/courses", await signIn("lecturer"))).json() as {
      items: unknown[];
    };
    expect(stud.items.length).toBeGreaterThan(0);
    expect(lec.items).toHaveLength(0);
  });
});

describe("changing credentials later", () => {
  it("changes email and password without touching the role, permissions or data, and ends old sessions", async () => {
    const db = dev.db;
    const passwords = dev.t.app.get(PasswordService);
    const audit = dev.t.app.get(AuditService);
    const user = (await db.user.findUnique({ where: { emailNormalized: EMAILS.lecturer } }))!;
    const snapshot = async () => ({
      roles: await db.userRole.count({ where: { userId: user.id, revokedAt: null } }),
      grants: await db.instructorGrant.count({ where: { userId: user.id, revokedAt: null } }),
      users: await db.user.count(),
    });
    const before = await snapshot();
    const oldToken = await signIn("lecturer");
    const grantsBefore = (await access(oldToken)).courseGrants;

    const bad = await applyAccountUpdate(db, passwords, audit, {
      email: EMAILS.lecturer,
      newPassword: "short",
    });
    expect(bad.exitCode).toBe(1);
    const taken = await applyAccountUpdate(db, passwords, audit, {
      email: EMAILS.lecturer,
      newEmail: EMAILS.student,
    });
    expect(taken).toMatchObject({ exitCode: 1, message: expect.stringMatching(/already uses/) });

    const ok = await applyAccountUpdate(db, passwords, audit, {
      email: EMAILS.lecturer,
      newEmail: "Lecturer.New@Client.example",
      newPassword: "a-brand-new-password-91",
    });
    expect(ok.exitCode).toBe(0);
    expect(await snapshot()).toEqual(before);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).id).toBe(user.id);

    // The old password and the old email stop working; the old session is ended.
    expect((await dev.login(EMAILS.lecturer, pw[EMAILS.lecturer]!)).statusCode).toBe(401);
    expect((await get(dev, "/me/access", oldToken)).statusCode).toBe(401);
    // The new ones work, and the account is still a Lecturer with the same grants.
    const res = await dev.login("lecturer.new@client.example", "a-brand-new-password-91");
    expect(res.statusCode).toBe(200);
    const fresh = await access((res.json() as { accessToken: string }).accessToken);
    expect(fresh.roles).toContain("instructor");
    expect(fresh.courseGrants).toEqual(grantsBefore);
    // Other accounts are untouched.
    await signIn("instructor");
    await signIn("student");
    const events = await db.auditEvent.count({
      where: { action: "account.credentials_changed", targetId: user.id },
    });
    expect(events).toBe(1);
  });

  it("reports an unknown account and an empty request", async () => {
    const db = dev.db;
    const a = dev.t.app.get(PasswordService);
    const b = dev.t.app.get(AuditService);
    expect(
      await applyAccountUpdate(db, a, b, {
        email: "nobody@x.example",
        newPassword: "a-long-enough-password-1",
      }),
    ).toMatchObject({ exitCode: 1 });
    expect(await applyAccountUpdate(db, a, b, { email: EMAILS.student })).toMatchObject({
      exitCode: 1,
    });
  });
});
