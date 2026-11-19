import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  PermissionUserDetail,
  PermissionUsersPage,
  RoleDefaultsResponse,
} from "@chartnexa/api-contracts";
import { CoursesService } from "../src/modules/courses/index.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let admin: Person;
let manager: Person;
let student: Person;
let svc: CoursesService;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
  svc = h.t.app.get(CoursesService);
  admin = await person(h, "admin");
  manager = await person(h, "manager");
  student = await person(h);
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

const course = (title = "Managed course") =>
  svc.create(
    admin.id,
    {
      title,
      description: "A complete description",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    } as never,
    "req-1",
  );
const detail = async (who: Person, id: string) =>
  h.call("GET", `/staff/permissions/users/${id}`, { token: who.accessToken });
const getDetail = async (id: string) => (await detail(admin, id)).json() as PermissionUserDetail;
const save = (who: Person, id: string, body: unknown) =>
  h.call("PUT", `/staff/permissions/users/${id}`, { token: who.accessToken, body });
const edit = (who: Person, courseId: string, version: number) =>
  h.call("PATCH", `/staff/courses/${courseId}`, {
    token: who.accessToken,
    body: { title: `Edited ${version}`, expectedVersion: version },
  });

describe("who may use it", () => {
  it("refuses everyone but an Admin on every route", async () => {
    const ins = await person(h, "instructor");
    const routes: Array<["GET" | "PUT", string, unknown?]> = [
      ["GET", "/staff/permissions/users?role=instructor"],
      ["GET", `/staff/permissions/users/${ins.id}`],
      [
        "PUT",
        `/staff/permissions/users/${ins.id}`,
        {
          reason: "Trying",
          expectedVersion: 0,
          changes: [{ permission: "course:create", enabled: true }],
        },
      ],
      ["GET", "/staff/permissions/roles"],
      [
        "PUT",
        "/staff/permissions/roles/manager",
        { reason: "Trying", changes: [{ permission: "users:read", enabled: false }] },
      ],
    ];
    for (const who of [manager, ins, student]) {
      for (const [method, url, body] of routes) {
        const r = await h.call(method, url, { token: who.accessToken, body });
        expect(r.statusCode, `${method} ${url}`).toBe(403);
      }
    }
    for (const [method, url, body] of routes) {
      expect((await h.call(method, url, { body })).statusCode, url).toBe(401);
    }
    expect(await h.db.instructorGrant.count({ where: { userId: ins.id } })).toBe(0);
  });

  it("searches by role and text, returning only summary fields", async () => {
    const ins = await person(h, "instructor");
    await h.db.user.update({ where: { id: ins.id }, data: { displayName: "Zed Guest Lecturer" } });
    const r = await h.call("GET", "/staff/permissions/users?role=instructor&q=guest%20lect", {
      token: admin.accessToken,
    });
    const page = r.json() as PermissionUsersPage;
    expect(page.items.map((i) => i.id)).toEqual([ins.id]);
    expect(Object.keys(page.items[0] ?? {}).sort()).toEqual([
      "displayName",
      "email",
      "id",
      "role",
      "status",
    ]);
    expect(r.body).not.toMatch(/password|hash|token|session/i);
    const students = (
      await h.call("GET", "/staff/permissions/users?role=student&limit=50", {
        token: admin.accessToken,
      })
    ).json() as PermissionUsersPage;
    expect(students.items.some((i) => i.id === student.id)).toBe(true);
    expect(students.items.some((i) => i.id === ins.id || i.id === admin.id)).toBe(false);
    expect(
      (await h.call("GET", "/staff/permissions/users?role=admin", { token: admin.accessToken }))
        .statusCode,
    ).toBe(400);
  });
});

describe("an Instructor's course permissions", () => {
  it("grants per explicit course, takes effect and ends at once, and audits with reasons", async () => {
    const ins = await person(h, "instructor");
    const c = await course();
    const other = await course("Not assigned");
    expect((await edit(ins, c.id, c.version)).statusCode).toBe(403);

    const v0 = (await getDetail(ins.id)).version;
    const r = await save(admin, ins.id, {
      reason: "Teaches this course",
      expectedVersion: v0,
      changes: [{ permission: "course:update", courseId: c.id, enabled: true }],
    });
    expect(r.statusCode).toBe(200);
    const d = r.json() as PermissionUserDetail;
    expect(d.version).toBe(v0 + 1);
    expect(d.courseGrants).toHaveLength(1);
    expect(d.courseGrants[0]).toMatchObject({ permission: "course:update", courseId: c.id });

    expect((await edit(ins, c.id, c.version)).statusCode).toBe(200);
    // Stays restricted to the assigned course.
    expect((await edit(ins, other.id, other.version)).statusCode).toBe(403);

    const off = await save(admin, ins.id, {
      reason: "Course handed over",
      expectedVersion: d.version,
      changes: [{ permission: "course:update", courseId: c.id, enabled: false }],
    });
    expect(off.statusCode).toBe(200);
    expect((await edit(ins, c.id, c.version + 1)).statusCode).toBe(403);

    const rows = await auditRows(h, { targetId: ins.id });
    const actions = rows.map((a) => [a.action, a.reason]);
    expect(actions).toContainEqual(["grant.create", "Teaches this course"]);
    expect(actions).toContainEqual(["grant.revoke", "Course handed over"]);
  });

  it("requires a course for course permissions and never grants them academy-wide", async () => {
    const ins = await person(h, "instructor");
    const v = (await getDetail(ins.id)).version;
    const r = await save(admin, ins.id, {
      reason: "No course given",
      expectedVersion: v,
      changes: [{ permission: "course:publish", enabled: true }],
    });
    expect(r.statusCode).toBe(400);
    const academy = await save(admin, ins.id, {
      reason: "Wrong shape",
      expectedVersion: v,
      changes: [{ permission: "course:create", courseId: (await course()).id, enabled: true }],
    });
    expect(academy.statusCode).toBe(400);
    expect(await h.db.instructorGrant.count({ where: { userId: ins.id } })).toBe(0);
  });

  it("can give create-course individually, with an expiry that ends it by itself", async () => {
    const ins = await person(h, "instructor");
    const v = (await getDetail(ins.id)).version;
    const when = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const r = await save(admin, ins.id, {
      reason: "Guest lecturer",
      expectedVersion: v,
      changes: [{ permission: "course:create", enabled: true, expiresAt: when }],
    });
    expect(r.statusCode).toBe(200);
    const row = (r.json() as PermissionUserDetail).permissions.find(
      (p) => p.permission === "course:create",
    );
    expect(row).toMatchObject({ enabled: true, source: "individual", roleDefault: false });
    expect(row?.expiresAt).toBe(when);
    const create = () =>
      h.call("POST", "/staff/courses", {
        token: ins.accessToken,
        body: {
          title: "Guest course",
          description: "A complete description",
          level: "beginner",
          priceCents: 0,
          coverTone: "blue",
        },
      });
    expect((await create()).statusCode).toBe(201);
    // Time passes: the grant counts for nothing even though the row still exists.
    await h.db
      .$executeRaw`UPDATE instructor_grants SET expires_at = now() - interval '1 second', created_at = now() - interval '1 day' WHERE user_id = ${ins.id}::uuid`;
    expect((await create()).statusCode).toBe(403);
    const after = await getDetail(ins.id);
    expect(after.permissions.find((p) => p.permission === "course:create")?.enabled).toBe(false);
    // And it can be given again.
    const again = await save(admin, ins.id, {
      reason: "Back for another term",
      expectedVersion: after.version,
      changes: [{ permission: "course:create", enabled: true }],
    });
    expect(again.statusCode).toBe(200);
    expect((await create()).statusCode).toBe(201);
  });

  it("refuses an expiry in the past", async () => {
    const ins = await person(h, "instructor");
    const r = await save(admin, ins.id, {
      reason: "Backdated",
      expectedVersion: 0,
      changes: [
        {
          permission: "course:create",
          enabled: true,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      ],
    });
    expect(r.statusCode).toBe(400);
  });
});

describe("restrictions", () => {
  it("never switches the four restricted permissions, for anyone, and audits the attempt", async () => {
    const mgr = await person(h, "manager");
    const ins = await person(h, "instructor");
    for (const target of [mgr, ins, student]) {
      for (const permission of [
        "roles:manage",
        "audit:read",
        "payments:read_full",
        "instructor_permissions:manage",
      ]) {
        for (const enabled of [true, false]) {
          const r = await save(admin, target.id, {
            reason: "Trying it",
            expectedVersion: 0,
            changes: [{ permission, enabled }],
          });
          expect(r.statusCode, `${permission} ${enabled}`).toBe(403);
        }
      }
    }
    const roleTry = await h.call("PUT", "/staff/permissions/roles/manager", {
      token: admin.accessToken,
      body: { reason: "Trying", changes: [{ permission: "audit:read", enabled: true }] },
    });
    expect(roleTry.statusCode).toBe(403);
    expect(await h.db.userPermissionDenial.count()).toBe(0);
    expect(await h.db.rolePermissionDefault.count()).toBe(0);
    const denied = await auditRows(h, { action: "permission.change", outcome: "denied" });
    expect(denied.length).toBeGreaterThan(0);
    // Database constraints back this up even for direct writes.
    await expect(
      h.db
        .$executeRaw`INSERT INTO user_permission_denials (user_id, permission, reason) VALUES (${mgr.id}::uuid, 'audit:read', 'direct write')`,
    ).rejects.toThrow();
    await expect(
      h.db
        .$executeRaw`INSERT INTO role_permission_defaults (role, permission, enabled, reason) VALUES ('manager', 'roles:manage', true, 'direct write')`,
    ).rejects.toThrow();
  });

  it("does not let an Admin change themselves or another Admin", async () => {
    const other = await person(h, "admin");
    for (const target of [admin, other]) {
      const r = await save(admin, target.id, {
        reason: "Trying it",
        expectedVersion: 0,
        changes: [{ permission: "reviews:write", enabled: false }],
      });
      expect(r.statusCode).toBe(403);
    }
    expect((await detail(admin, other.id)).statusCode).toBe(403);
  });

  it("is all or nothing, and refuses a stale version", async () => {
    const ins = await person(h, "instructor");
    const c = await course();
    const v = (await getDetail(ins.id)).version;
    const mixed = await save(admin, ins.id, {
      reason: "One bad change",
      expectedVersion: v,
      changes: [
        { permission: "course:update", courseId: c.id, enabled: true },
        { permission: "roles:manage", enabled: true },
      ],
    });
    expect(mixed.statusCode).toBe(403);
    expect(await h.db.instructorGrant.count({ where: { userId: ins.id } })).toBe(0);

    const ok = await save(admin, ins.id, {
      reason: "Fine change",
      expectedVersion: v,
      changes: [{ permission: "course:update", courseId: c.id, enabled: true }],
    });
    expect(ok.statusCode).toBe(200);
    const stale = await save(admin, ins.id, {
      reason: "Used an old screen",
      expectedVersion: v,
      changes: [{ permission: "course:publish", courseId: c.id, enabled: true }],
    });
    expect(stale.statusCode).toBe(409);
  });

  it("answers 404 for an unknown or non-managed account", async () => {
    expect((await detail(admin, "5b1c1a6e-3b7a-4a0c-9d3e-2f1a6b8c9d01")).statusCode).toBe(404);
  });
});

describe("a Manager's role permissions", () => {
  it("switches one off for one person immediately, and back on", async () => {
    const mgr = await person(h, "manager");
    const lookup = () =>
      h.call("GET", "/staff/users/lookup?email=nobody@example.com", { token: mgr.accessToken });
    expect((await lookup()).statusCode).toBe(404);
    const d0 = await getDetail(mgr.id);
    const row0 = d0.permissions.find((p) => p.permission === "users:read");
    expect(row0).toMatchObject({ enabled: true, source: "role", roleDefault: true });
    const off = await save(admin, mgr.id, {
      reason: "Not needed in this job",
      expectedVersion: d0.version,
      changes: [{ permission: "users:read", enabled: false }],
    });
    expect(off.statusCode).toBe(200);
    expect(
      (off.json() as PermissionUserDetail).permissions.find((p) => p.permission === "users:read"),
    ).toMatchObject({ enabled: false, source: "switched_off", roleDefault: true });
    expect((await lookup()).statusCode).toBe(403);
    // A different Manager is unaffected.
    const mgr2 = await person(h, "manager");
    expect(
      (
        await h.call("GET", "/staff/users/lookup?email=nobody@example.com", {
          token: mgr2.accessToken,
        })
      ).statusCode,
    ).toBe(404);
    const on = await save(admin, mgr.id, {
      reason: "Needed again",
      expectedVersion: (off.json() as PermissionUserDetail).version,
      changes: [{ permission: "users:read", enabled: true }],
    });
    expect(on.statusCode).toBe(200);
    expect((await lookup()).statusCode).toBe(404);
    const actions = (await auditRows(h, { targetId: mgr.id })).map((a) => [a.action, a.reason]);
    expect(actions).toContainEqual(["permission.deny", "Not needed in this job"]);
    expect(actions).toContainEqual(["permission.allow", "Needed again"]);
  });

  it("ends a timed switch-off by itself", async () => {
    const mgr = await person(h, "manager");
    const when = new Date(Date.now() + 3600_000).toISOString();
    const d = await getDetail(mgr.id);
    const r = await save(admin, mgr.id, {
      reason: "Away for a while",
      expectedVersion: d.version,
      changes: [{ permission: "users:read", enabled: false, expiresAt: when }],
    });
    expect(r.statusCode).toBe(200);
    const lookup = () =>
      h.call("GET", "/staff/users/lookup?email=nobody@example.com", { token: mgr.accessToken });
    expect((await lookup()).statusCode).toBe(403);
    await h.db
      .$executeRaw`UPDATE user_permission_denials SET expires_at = now() - interval '1 second', created_at = now() - interval '1 day' WHERE user_id = ${mgr.id}::uuid`;
    expect((await lookup()).statusCode).toBe(404);
  });
});

describe("role defaults", () => {
  it("changes what a whole role holds and shows it, with an audit row", async () => {
    const mgrA = await person(h, "manager");
    const mgrB = await person(h, "manager");
    const lookup = (p: Person) =>
      h.call("GET", "/staff/users/lookup?email=nobody@example.com", { token: p.accessToken });
    expect((await lookup(mgrA)).statusCode).toBe(404);
    const r = await h.call("PUT", "/staff/permissions/roles/manager", {
      token: admin.accessToken,
      body: {
        reason: "Managers do not search people",
        changes: [{ permission: "users:read", enabled: false }],
      },
    });
    expect(r.statusCode).toBe(200);
    const mgr = (r.json() as RoleDefaultsResponse).roles.find((x) => x.role === "manager");
    expect(mgr?.permissions.find((p) => p.permission === "users:read")).toMatchObject({
      builtIn: true,
      enabled: false,
    });
    expect((await lookup(mgrA)).statusCode).toBe(403);
    expect((await lookup(mgrB)).statusCode).toBe(403);
    // The person screen says it comes from the role being off, and cannot be forced on one by one.
    const d = await getDetail(mgrA.id);
    const row = d.permissions.find((p) => p.permission === "users:read");
    expect(row).toMatchObject({
      enabled: false,
      source: "none",
      roleDefault: false,
      changeable: false,
    });
    const force = await save(admin, mgrA.id, {
      reason: "Force it on",
      expectedVersion: d.version,
      changes: [{ permission: "users:read", enabled: true }],
    });
    expect(force.statusCode).toBe(400);
    // Restoring the built-in answer removes the override row.
    const back = await h.call("PUT", "/staff/permissions/roles/manager", {
      token: admin.accessToken,
      body: { reason: "Back to normal", changes: [{ permission: "users:read", enabled: true }] },
    });
    expect(back.statusCode).toBe(200);
    expect(await h.db.rolePermissionDefault.count()).toBe(0);
    expect((await lookup(mgrA)).statusCode).toBe(404);
    const rows = await auditRows(h, { action: "role.defaults.update", outcome: "success" });
    expect(rows.map((a) => a.reason)).toEqual(["Managers do not search people", "Back to normal"]);
  });

  it("lets Instructors gain create-course by default but never a course permission", async () => {
    const ins = await person(h, "instructor");
    const create = () =>
      h.call("POST", "/staff/courses", {
        token: ins.accessToken,
        body: {
          title: "Default course",
          description: "A complete description",
          level: "beginner",
          priceCents: 0,
          coverTone: "blue",
        },
      });
    expect((await create()).statusCode).toBe(403);
    const course1 = await h.call("PUT", "/staff/permissions/roles/instructor", {
      token: admin.accessToken,
      body: { reason: "Pilot", changes: [{ permission: "course:publish", enabled: true }] },
    });
    expect(course1.statusCode).toBe(400);
    const r = await h.call("PUT", "/staff/permissions/roles/instructor", {
      token: admin.accessToken,
      body: {
        reason: "All instructors may author",
        changes: [{ permission: "course:create", enabled: true }],
      },
    });
    expect(r.statusCode).toBe(200);
    expect((await create()).statusCode).toBe(201);
    // One person can still be switched off.
    const d = await getDetail(ins.id);
    expect(d.permissions.find((p) => p.permission === "course:create")).toMatchObject({
      enabled: true,
      source: "role",
    });
    const off = await save(admin, ins.id, {
      reason: "Authoring paused",
      expectedVersion: d.version,
      changes: [{ permission: "course:create", enabled: false }],
    });
    expect(off.statusCode).toBe(200);
    expect((await create()).statusCode).toBe(403);
    await h.call("PUT", "/staff/permissions/roles/instructor", {
      token: admin.accessToken,
      body: { reason: "Pilot over", changes: [{ permission: "course:create", enabled: false }] },
    });
  });
});

describe("a Student's permissions", () => {
  it("switches review writing off and on, and never creates or removes course access", async () => {
    const s = await person(h);
    const c = await course("Student course");
    await h.call("PUT", `/staff/courses/${c.id}/publish`, { token: admin.accessToken });
    // No purchase or enrolment: reviewing is refused whatever the switch says.
    const review = (courseId: string) =>
      h.call("PUT", `/me/courses/${courseId}/review`, {
        token: s.accessToken,
        body: { rating: 5, body: "Great course" },
      });
    expect((await review(c.id)).statusCode).toBe(403);
    const d0 = await getDetail(s.id);
    expect(d0.courseAccess).toEqual([]);
    expect(d0.permissions.map((p) => p.permission)).toEqual(["reviews:write"]);
    const on = await save(admin, s.id, {
      reason: "Make sure it is on",
      expectedVersion: d0.version,
      changes: [{ permission: "reviews:write", enabled: true }],
    });
    expect(on.statusCode).toBe(200);
    expect((await review(c.id)).statusCode).toBe(403);
    expect(await h.db.entitlement.count({ where: { userId: s.id } })).toBe(0);

    // With a real enrolment the switch decides.
    await h.db.entitlement.create({
      data: { userId: s.id, courseId: c.id, source: "admin_grant", grantReason: "Test enrolment" },
    });
    expect((await review(c.id)).statusCode).toBe(200);
    const d1 = await getDetail(s.id);
    expect(d1.courseAccess).toHaveLength(1);
    const off = await save(admin, s.id, {
      reason: "Abusive reviews",
      expectedVersion: d1.version,
      changes: [{ permission: "reviews:write", enabled: false }],
    });
    expect(off.statusCode).toBe(200);
    expect((await review(c.id)).statusCode).toBe(403);
    // Access to the course itself is untouched.
    expect(await h.db.entitlement.count({ where: { userId: s.id, status: "active" } })).toBe(1);
    const access = await h.call("GET", "/me/access", { token: s.accessToken });
    expect(access.json().permissions).not.toContain("reviews:write");
    // Course-level permissions can never be given to a Student.
    const bad = await save(admin, s.id, {
      reason: "Make them staff",
      expectedVersion: (off.json() as PermissionUserDetail).version,
      changes: [{ permission: "course:publish", courseId: c.id, enabled: true }],
    });
    expect(bad.statusCode).toBe(400);
    const bad2 = await save(admin, s.id, {
      reason: "Make them staff",
      expectedVersion: (off.json() as PermissionUserDetail).version,
      changes: [{ permission: "users:read", enabled: true }],
    });
    expect(bad2.statusCode).toBe(400);
    expect(await h.db.instructorGrant.count({ where: { userId: s.id } })).toBe(0);
  });
});
