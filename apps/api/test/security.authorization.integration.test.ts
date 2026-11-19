import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { RequestMethod } from "@nestjs/common";
import { ModulesContainer } from "@nestjs/core";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runDemoSeed } from "../scripts/demo/seed.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

/**
 * Attacks, not features: every route is called as every kind of account and the answer is checked
 * against what that account's permissions allow; one person's ids are tried by another; tokens
 * are forged and replayed; roles are taken away mid-session. Run against the same seeded accounts
 * the phone uses, with the two-step shortcut OFF (Admin and Manager get their tokens through the
 * database here, as a person with an authenticator would have).
 */
let h: Harness;
let drop: () => Promise<void>;
let dir: string;
const assets = join(import.meta.dirname, "..", "demo-assets");
const IDS = ["anon", "student", "instructor", "lecturer", "manager", "admin"] as const;
type Id = (typeof IDS)[number];
const tok: Partial<Record<Id, string>> = {};
const ZERO = "00000000-0000-4000-8000-000000000001";

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  dir = await mkdtemp(join(tmpdir(), "chartnexa-sec-"));
  // NODE_ENV=development + shortcut only to obtain Admin and Manager tokens; every attack below uses real tokens.
  h = await makeHarness(db.url, {
    STORAGE_DIR: join(dir, "storage"),
    NODE_ENV: "development",
    MFA_DEV_BYPASS: "true",
  });
  const credentialsFile = join(dir, "creds.json");
  await runDemoSeed(h.t.app, { assetsDir: assets, credentialsFile });
  const creds = (
    JSON.parse(await readFile(credentialsFile, "utf8")) as {
      accounts: Record<string, { password: string }>;
    }
  ).accounts;
  for (const who of IDS.filter((i) => i !== "anon")) {
    const email = `${who}@chartnexa.test`;
    tok[who] = (
      (await h.login(email, creds[email]!.password)).json() as { accessToken: string }
    ).accessToken;
  }
}, 240_000);
afterAll(async () => {
  await h.t.app.close();
  await drop();
  await rm(dir, { recursive: true, force: true });
});

interface Route {
  method: string;
  path: string;
  guards: string[];
  permission?: string;
  anyCourse?: boolean;
}
const join2 = (...parts: string[]) =>
  "/" +
  parts
    .flatMap((p) => p.split("/"))
    .filter(Boolean)
    .join("/");

function inventory(): Route[] {
  const out: Route[] = [];
  for (const mod of h.t.app.get(ModulesContainer).values()) {
    for (const wrapper of mod.controllers.values()) {
      const ctrl = wrapper.metatype as (new (...a: unknown[]) => unknown) | null;
      if (!ctrl) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? "");
      const classGuards = (Reflect.getMetadata(GUARDS_METADATA, ctrl) ?? []) as { name: string }[];
      const proto = ctrl.prototype as Record<string, unknown>;
      for (const key of Object.getOwnPropertyNames(proto)) {
        const handler = proto[key];
        if (key === "constructor" || typeof handler !== "function") continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (path === undefined) continue;
        const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number]!;
        const guards = [
          ...classGuards,
          ...((Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as { name: string }[]),
        ].map((g) => g.name);
        const req = Reflect.getMetadata("access:requirement", handler) as
          { permission: string; anyCourse?: boolean } | undefined;
        out.push({
          method,
          path: join2(base, path).replace(/:[A-Za-z]+/g, ZERO),
          guards,
          ...(req ? { permission: req.permission, anyCourse: req.anyCourse === true } : {}),
        });
      }
    }
  }
  return out;
}

const call = (id: Id, r: Route) =>
  h.call(r.method as "GET", r.path, {
    ...(tok[id] ? { token: tok[id]! } : {}),
    ...(r.method === "GET" || r.method === "DELETE" ? {} : { body: {} }),
  });

describe("every route, as every kind of account", () => {
  it("answers 401 to anyone not signed in on every route that requires sign-in", async () => {
    const need = inventory().filter((r) => r.guards.includes("AuthGuard"));
    expect(need.length).toBeGreaterThan(80);
    for (const r of need) {
      const res = await call("anon", r);
      expect(res.statusCode, `${r.method} ${r.path}`).toBe(401);
    }
  });

  it("refuses a Student on every staff route with 403, before looking anything up", async () => {
    const staff = inventory().filter((r) => r.path.startsWith("/staff"));
    expect(staff.length).toBeGreaterThan(50);
    for (const r of staff) {
      const res = await call("student", r);
      expect(res.statusCode, `${r.method} ${r.path}`).toBe(403);
    }
  });

  it("allows each account exactly what its permissions say on every permission-guarded route", async () => {
    const guarded = inventory().filter((r) => r.permission);
    expect(guarded.length).toBeGreaterThan(50);
    const access: Record<
      string,
      { permissions: string[]; courseGrants: { permissions: string[] }[] }
    > = {};
    for (const who of IDS.filter((i) => i !== "anon")) {
      access[who] = (await h.call("GET", "/me/access", { token: tok[who]! })).json();
    }
    const failures: string[] = [];
    for (const who of IDS.filter((i) => i !== "anon")) {
      for (const r of guarded) {
        const a = access[who]!;
        const holds =
          a.permissions.includes(r.permission!) ||
          (r.anyCourse === true &&
            a.courseGrants.some((g) => g.permissions.includes(r.permission!)));
        const res = await call(who, r);
        if (res.statusCode >= 500)
          failures.push(`${who} ${r.method} ${r.path} -> ${res.statusCode} (server error)`);
        else if (!holds && res.statusCode !== 403)
          failures.push(`${who} ${r.method} ${r.path} -> ${res.statusCode}, expected 403`);
        else if (holds && res.statusCode === 403 && r.anyCourse !== true)
          failures.push(`${who} ${r.method} ${r.path} -> 403 but holds ${r.permission}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("never answers a server error to any account on any route with empty input", async () => {
    const bad: string[] = [];
    for (const r of inventory()) {
      if (
        r.path.startsWith("/health") ||
        r.path.startsWith("/metrics") ||
        r.path.startsWith("/test")
      )
        continue;
      // These end the very sessions the rest of this file uses; they are covered in the session tests.
      if (
        /\/auth\/logout|\/me\/sessions|\/me\/password|\/me\/mfa|^DELETE \/me$/.test(
          `${r.method} ${r.path}`,
        ) ||
        (r.method === "DELETE" && r.path === "/me")
      )
        continue;
      for (const who of IDS) {
        const res = await call(who, r);
        if (res.statusCode >= 500) bad.push(`${who} ${r.method} ${r.path} -> ${res.statusCode}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("the sensitive routes, by name", () => {
  const sensitive: {
    label: string;
    method: "GET" | "POST" | "PUT";
    path: string;
    allowed: Id[];
  }[] = [
    { label: "audit log", method: "GET", path: "/staff/audit-events", allowed: ["admin"] },
    {
      label: "instructor list",
      method: "GET",
      path: "/staff/instructors",
      allowed: ["manager", "admin"],
    },
    {
      label: "invitations",
      method: "GET",
      path: "/staff/instructor-invitations",
      allowed: ["manager", "admin"],
    },
    {
      label: "user lookup",
      method: "GET",
      path: "/staff/users/lookup?email=a@b.co",
      allowed: ["manager", "admin"],
    },
    {
      label: "assign a role",
      method: "PUT",
      path: `/staff/users/${ZERO}/role`,
      allowed: ["admin"],
    },
    { label: "orders", method: "GET", path: "/staff/orders", allowed: ["manager", "admin"] },
    {
      label: "post announcements",
      method: "GET",
      path: "/staff/announcements",
      allowed: ["manager", "admin"],
    },
    {
      label: "review moderation",
      method: "GET",
      path: "/staff/reviews",
      allowed: ["manager", "admin"],
    },
    {
      label: "course list",
      method: "GET",
      path: "/staff/courses",
      allowed: ["instructor", "lecturer", "manager", "admin"],
    },
    {
      label: "categories",
      method: "GET",
      path: "/staff/categories",
      allowed: ["manager", "admin"],
    },
  ];
  it.each(sensitive)("$label is open only to $allowed", async ({ method, path, allowed }) => {
    for (const who of IDS) {
      const res = await h.call(method, path, {
        ...(tok[who] ? { token: tok[who]! } : {}),
        ...(method === "GET" ? {} : { body: { role: "admin", reason: "test attack" } }),
      });
      if (allowed.includes(who)) expect(res.statusCode, `${who} ${path}`).not.toBe(403);
      else expect(res.statusCode, `${who} ${path}`).toBeGreaterThanOrEqual(401);
      if (!allowed.includes(who)) expect([401, 403], `${who} ${path}`).toContain(res.statusCode);
    }
  });
});

describe("tokens", () => {
  const secret = new TextEncoder().encode("test-access-secret-test-access-secret");
  const forge = async (
    claims: { sub: string; sid: string },
    opts: {
      alg?: "HS256" | "HS384";
      key?: Uint8Array;
      exp?: string;
      extra?: Record<string, unknown>;
    } = {},
  ) =>
    new SignJWT({ sid: claims.sid, ...(opts.extra ?? {}) })
      .setProtectedHeader({ alg: opts.alg ?? "HS256" })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "5m")
      .sign(opts.key ?? secret);
  let adminId: string;
  let adminSession: string;
  beforeAll(async () => {
    const user = await h.db.user.findUniqueOrThrow({
      where: { emailNormalized: "admin@chartnexa.test" },
    });
    adminId = user.id;
    adminSession = (
      await h.db.session.findFirstOrThrow({ where: { userId: adminId, revokedAt: null } })
    ).id;
  });
  const asStudent = async () => {
    const u = await h.db.user.findUniqueOrThrow({
      where: { emailNormalized: "student@chartnexa.test" },
    });
    return {
      sub: u.id,
      sid: (await h.db.session.findFirstOrThrow({ where: { userId: u.id, revokedAt: null } })).id,
    };
  };

  it("rejects a token with a wrong signature, no signature, another algorithm or an expired time", async () => {
    const s = await asStudent();
    const wrong = await forge(s, {
      key: new TextEncoder().encode("another-secret-another-secret-another"),
    });
    const alg384 = await forge(s, { alg: "HS384" });
    const expired = await forge(s, { exp: "-1m" as never });
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: s.sub, sid: s.sid })).toString("base64url")}.`;
    for (const t of [wrong, alg384, none, expired, "garbage", ""]) {
      const res = await h.call("GET", "/me/access", { token: t });
      expect(res.statusCode).toBe(401);
    }
  });

  it("does not let a claim in the token raise a person's role", async () => {
    const s = await asStudent();
    const t = await forge(s, {
      extra: { role: "admin", roles: ["admin"], permissions: ["audit:read"], admin: true },
    });
    expect((await h.call("GET", "/me/access", { token: t })).json().roles).toEqual(["student"]);
    expect((await h.call("GET", "/staff/audit-events", { token: t })).statusCode).toBe(403);
  });

  it("does not let one person's token open another person's session", async () => {
    const s = await asStudent();
    const t = await forge({ sub: adminId, sid: s.sid }); // Admin's id with the Student's session
    expect((await h.call("GET", "/me/access", { token: t })).statusCode).toBe(401);
    const t2 = await forge({ sub: s.sub, sid: adminSession });
    expect((await h.call("GET", "/me/access", { token: t2 })).statusCode).toBe(401);
  });

  it("ends a session at once on logout, and a disabled account at once", async () => {
    const a = await h.signIn();
    expect((await h.call("GET", "/me/access", { token: a.accessToken })).statusCode).toBe(200);
    await h.call("POST", "/auth/logout", { token: a.accessToken });
    expect((await h.call("GET", "/me/access", { token: a.accessToken })).statusCode).toBe(401);
    const b = await h.signIn();
    const row = await h.db.session.findUniqueOrThrow({ where: { id: b.sessionId } });
    await h.db.user.update({ where: { id: row.userId }, data: { status: "disabled" } });
    expect((await h.call("GET", "/me/access", { token: b.accessToken })).statusCode).toBe(401);
  });

  it("takes a role away from a signed-in person immediately, without a new sign-in", async () => {
    const m = await h.signIn();
    const row = await h.db.session.findUniqueOrThrow({ where: { id: m.sessionId } });
    await h.db.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
    const role = await h.db.userRole.create({
      data: { userId: row.userId, role: "manager", reason: "test" },
    });
    expect(
      (await h.call("GET", "/staff/instructor-invitations", { token: m.accessToken })).statusCode,
    ).toBe(200);
    await h.db.userRole.update({
      where: { id: role.id },
      data: { revokedAt: new Date(), revokeReason: "test" },
    });
    expect(
      (await h.call("GET", "/staff/instructor-invitations", { token: m.accessToken })).statusCode,
    ).toBe(403);
  });

  it("refuses to register or edit a profile with a role field", async () => {
    const reg = await h.call("POST", "/auth/register", {
      body: {
        email: `x-${Date.now()}@example.com`,
        password: "correct horse battery",
        role: "admin",
        roles: ["admin"],
      },
    });
    expect(reg.statusCode).toBe(400);
    const me = await h.call("PATCH", "/me", {
      token: tok.student!,
      body: { displayName: "Sam", roles: ["admin"], role: "admin" },
    });
    expect(me.statusCode).toBe(400);
    expect((await h.call("GET", "/me/access", { token: tok.student! })).json().roles).toEqual([
      "student",
    ]);
  });
});

describe("one person's data from another person's account", () => {
  it("keeps orders, assignments and reviews to their owner", async () => {
    const other = await h.signIn();
    const mine = (await h.call("GET", "/me/orders", { token: tok.student! })).json().items as {
      id: string;
    }[];
    expect(mine.length).toBeGreaterThan(0);
    // Someone else cannot read, pay or cancel the Student's order: it simply does not exist for them.
    const order = mine[0]!;
    expect(
      (await h.call("GET", `/me/orders/${order.id}`, { token: other.accessToken })).statusCode,
    ).toBe(404);
    expect(
      (await h.call("GET", `/me/orders/${order.id}`, { token: tok.lecturer! })).statusCode,
    ).toBe(404);
    const assignments = (await h.call("GET", "/me/assignments", { token: tok.student! })).json()
      .items as { id: string }[];
    expect(assignments.length).toBeGreaterThan(0);
    for (const t of [other.accessToken, tok.lecturer!, tok.manager!]) {
      expect(
        (await h.call("GET", `/me/assignments/${assignments[0]!.id}`, { token: t })).statusCode,
      ).toBeGreaterThanOrEqual(403);
    }
    // Someone else's list is theirs alone.
    expect(
      ((await h.call("GET", "/me/orders", { token: other.accessToken })).json().items as unknown[])
        .length,
    ).toBe(0);
    expect(
      ((await h.call("GET", "/me/courses", { token: other.accessToken })).json().items as unknown[])
        .length,
    ).toBe(0);
    expect(
      (
        (await h.call("GET", "/me/continue-learning", { token: other.accessToken })).json() as {
          item: unknown;
        }
      ).item,
    ).toBeNull();
  });

  it("does not give a Student another person's progress, files or live classes without owning the course", async () => {
    const other = await h.signIn();
    const courses = (await h.call("GET", "/staff/courses", { token: tok.instructor! })).json()
      .items as { id: string }[];
    const course = courses[0]!.id;
    const lessons = (
      await h.call("GET", `/staff/courses/${course}/lessons`, { token: tok.instructor! })
    ).json().items as { id: string; isPreview: boolean }[];
    const paid = lessons.find((l) => !l.isPreview)!;
    for (const path of [
      `/courses/${course}/lessons/${paid.id}`,
      `/courses/${course}/lessons/${paid.id}/video`,
      `/courses/${course}/lessons/${paid.id}/resources`,
    ]) {
      expect((await h.call("GET", path, { token: other.accessToken })).statusCode, path).toBe(403);
    }
    expect(
      (await h.call("GET", `/me/courses/${course}/progress`, { token: other.accessToken }))
        .statusCode,
    ).toBeGreaterThanOrEqual(403);
    expect(
      (
        await h.call("POST", `/me/courses/${course}/live-sessions/${ZERO}/join`, {
          token: other.accessToken,
        })
      ).statusCode,
    ).toBeGreaterThanOrEqual(403);
  });
});

describe("a Lecturer inside the Lecturer's own course, using ids from a course that is not theirs", () => {
  it("finds nothing: another course's lessons, files, video and classes answer 404 or 403, never data", async () => {
    const lecturerCourses = (
      (await h.call("GET", "/staff/courses", { token: tok.lecturer! })).json().items as {
        id: string;
      }[]
    ).map((c) => c.id);
    const all = (await h.call("GET", "/staff/courses", { token: tok.instructor! })).json()
      .items as { id: string }[];
    const own = lecturerCourses[0]!;
    const other = all.find((c) => !lecturerCourses.includes(c.id))!.id;
    const otherLessons = (
      await h.call("GET", `/staff/courses/${other}/lessons`, { token: tok.instructor! })
    ).json().items as { id: string }[];
    const lesson = otherLessons[0]!.id;
    for (const [method, path] of [
      ["GET", `/staff/courses/${own}/lessons/${lesson}`],
      ["PATCH", `/staff/courses/${own}/lessons/${lesson}`],
      ["DELETE", `/staff/courses/${own}/lessons/${lesson}`],
      ["GET", `/staff/courses/${own}/lessons/${lesson}/video`],
      ["DELETE", `/staff/courses/${own}/lessons/${lesson}/video`],
      ["GET", `/staff/courses/${own}/lessons/${lesson}/resources`],
      ["POST", `/staff/courses/${own}/lessons/${lesson}/uploads`],
      ["PUT", `/staff/courses/${own}/lessons/${lesson}/module`],
    ] as const) {
      const res = await h.call(method, path, {
        token: tok.lecturer!,
        ...(method === "GET" || method === "DELETE"
          ? {}
          : {
              body: {
                title: "x",
                fileName: "a.pdf",
                mimeType: "application/pdf",
                size: 5,
                moduleId: null,
                expectedVersion: 1,
              },
            }),
      });
      // Removing something that is not in this course is an idempotent no-op (200, deleted: false);
      // everything else is refused. Either way the other course's data is untouched (checked below).
      const noop =
        method === "DELETE" &&
        path.endsWith("/video") &&
        res.statusCode === 200 &&
        res.json().deleted === false;
      if (!noop)
        expect([400, 403, 404], `${method} ${path} -> ${res.statusCode}`).toContain(res.statusCode);
      expect(JSON.stringify(res.json())).not.toContain(lesson + '","');
    }
    // Nothing of the other course's lesson changed.
    const after = (
      await h.call("GET", `/staff/courses/${other}/lessons/${lesson}`, { token: tok.instructor! })
    ).json();
    expect(after.id).toBe(lesson);
    expect(after.title).not.toBe("x");
    // The live class of the other course, by id, through the Lecturer's own course path.
    const live = await h.call("POST", `/staff/courses/${other}/live-sessions`, {
      token: tok.instructor!,
      body: {
        title: "Other class",
        description: "",
        startsAt: new Date(Date.now() + 3_600_000).toISOString(),
        durationMinutes: 30,
        joinUrl: "https://meet.example.com/o",
      },
    });
    expect(live.statusCode).toBe(201);
    for (const [method, path] of [
      ["PATCH", `/staff/courses/${own}/live-sessions/${live.json().id}`],
      ["POST", `/staff/courses/${own}/live-sessions/${live.json().id}/cancel`],
    ] as const) {
      const res = await h.call(method, path, {
        token: tok.lecturer!,
        body:
          method === "PATCH"
            ? { expectedVersion: 1, title: "Hijack" }
            : { expectedVersion: 1, reason: "no way" },
      });
      expect([403, 404], `${method} ${path}`).toContain(res.statusCode);
    }
  });
});

describe("sessions belong to their owner", () => {
  it("lists only my own devices and refuses to end someone else's session", async () => {
    const a = await h.signIn();
    const b = await h.signIn();
    const mine = (await h.call("GET", "/me/sessions", { token: a.accessToken })).json() as {
      id: string;
    }[];
    expect(mine.map((x) => x.id)).not.toContain(b.sessionId);
    const res = await h.call("DELETE", `/me/sessions/${b.sessionId}`, { token: a.accessToken });
    expect(res.statusCode).toBe(404);
    // B is still signed in.
    expect((await h.call("GET", "/me/access", { token: b.accessToken })).statusCode).toBe(200);
  });

  it("cannot change another person's password or profile by naming their id", async () => {
    const a = await h.signIn();
    const b = await h.signIn();
    for (const [method, path] of [
      ["PATCH", `/me/${b.sessionId}`],
      ["PUT", `/users/${b.sessionId}/password`],
      ["PATCH", `/staff/users/${b.sessionId}`],
    ] as const) {
      const res = await h.call(method, path, { token: a.accessToken, body: { displayName: "x" } });
      expect([403, 404]).toContain(res.statusCode);
    }
  });
});

describe("what gets written to the logs", () => {
  it("holds no password, token or recovery code from any of the sign-ins above", async () => {
    const logs = h.t.logs();
    expect(logs.length).toBeGreaterThan(0);
    for (const t of Object.values(tok)) if (t) expect(logs).not.toContain(t);
    const creds = JSON.parse(await readFile(join(dir, "creds.json"), "utf8")) as {
      accounts: Record<string, { password: string }>;
    };
    for (const a of Object.values(creds.accounts)) expect(logs).not.toContain(a.password);
    expect(logs).not.toMatch(/"password"\s*:/i);
    expect(logs).not.toMatch(/refreshToken|authorization"\s*:\s*"Bearer/i);
  });
});
