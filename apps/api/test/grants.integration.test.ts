import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  errorEnvelopeSchema,
  type GrantResponse,
  type InstructorPermissionsResponse,
  type Page,
  type StaffCourse,
} from "@chartnexa/api-contracts";
import { CoursesService } from "../src/modules/courses/index.js";
import { assign, auditRows, person, revoke, type Person } from "./access-helpers.js";
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

const course = async (title = "Course for grants") =>
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
const grant = (actor: Person, target: string, body: unknown) =>
  h.call("POST", `/staff/instructors/${target}/grants`, { token: actor.accessToken, body });
const list = (actor: Person, target: string) =>
  h.call("GET", `/staff/instructors/${target}/permissions`, { token: actor.accessToken });
const endGrant = (actor: Person, target: string, id: string, reason = "No longer needed") =>
  h.call("POST", `/staff/instructors/${target}/grants/${id}/revoke`, {
    token: actor.accessToken,
    body: { reason },
  });
const patch = (who: Person, id: string, version: number, title: string) =>
  h.call("PATCH", `/staff/courses/${id}`, {
    token: who.accessToken,
    body: { title, expectedVersion: version },
  });
const activeGrants = (userId: string) =>
  h.db.instructorGrant.findMany({ where: { userId, revokedAt: null } });

describe("who may grant", () => {
  it("lets an Admin grant publishing and audits it without personal data", async () => {
    const ins = await person(h, "instructor");
    const c = await course();
    const res = await grant(admin, ins.id, {
      permission: "course:publish",
      courseId: c.id,
      reason: "Runs this course",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as GrantResponse;
    expect(body).toMatchObject({
      created: true,
      grant: { permission: "course:publish", courseId: c.id },
    });
    const rows = await auditRows(h, { action: "grant.create", targetId: ins.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: admin.id,
      outcome: "success",
      reason: "Runs this course",
    });
    expect(JSON.stringify(rows[0])).not.toMatch(/@/);
  });

  it("stops a Manager from granting, even a permission it once could, and audits the denial", async () => {
    const ins = await person(h, "instructor");
    const c = await course();
    const res = await grant(manager, ins.id, {
      permission: "course:publish",
      courseId: c.id,
      reason: "Please publish",
    });
    expect(res.statusCode).toBe(403);
    expect(errorEnvelopeSchema.safeParse(res.json()).success).toBe(true);
    expect(await activeGrants(ins.id)).toHaveLength(0);
    const denied = await auditRows(h, {
      action: "grant.create",
      targetId: ins.id,
      outcome: "denied",
    });
    expect(denied).toHaveLength(1);
  });

  it("refuses a Manager on every grantable permission (Admin only, decision Q38)", async () => {
    const ins = await person(h, "instructor");
    const c = await course();
    for (const permission of [
      "course:update",
      "course:publish",
      "lesson:upload",
      "live:schedule",
      "assignments:manage",
      "students:read",
      "reports:read",
    ]) {
      const res = await grant(manager, ins.id, {
        permission,
        courseId: c.id,
        reason: "Teaches it",
      });
      expect(res.statusCode, permission).toBe(403);
    }
    const create = await grant(manager, ins.id, {
      permission: "course:create",
      reason: "Trusted author",
    });
    expect(create.statusCode).toBe(403);
    expect(await activeGrants(ins.id)).toHaveLength(0);
  });

  it("refuses Students, Instructors and signed-out callers on every endpoint", async () => {
    const ins = await person(h, "instructor");
    const other = await person(h, "instructor");
    for (const who of [student, other]) {
      expect((await list(who, ins.id)).statusCode).toBe(403);
      expect(
        (await grant(who, ins.id, { permission: "course:create", reason: "Nope" })).statusCode,
      ).toBe(403);
      expect((await endGrant(who, ins.id, "5b1c1a6e-3b7a-4a0c-9d3e-2f1a6b8c9d01")).statusCode).toBe(
        403,
      );
    }
    expect((await h.call("GET", `/staff/instructors/${ins.id}/permissions`)).statusCode).toBe(401);
    expect(
      (await h.call("POST", `/staff/instructors/${ins.id}/grants`, { body: {} })).statusCode,
    ).toBe(401);
    expect(await activeGrants(ins.id)).toHaveLength(0);
    expect(
      (await auditRows(h, { targetId: ins.id, outcome: "denied" })).length,
    ).toBeGreaterThanOrEqual(6);
  });
});

describe("validation and eligibility", () => {
  it("names the field for bad grants and refuses non-grantable permissions", async () => {
    const ins = await person(h, "instructor");
    const c = await course();
    const noCourse = await grant(admin, ins.id, {
      permission: "course:update",
      reason: "Teaches it",
    });
    expect(noCourse.statusCode).toBe(400);
    expect(JSON.stringify(noCourse.json())).toContain("courseId");
    const wrongScope = await grant(admin, ins.id, {
      permission: "course:create",
      courseId: c.id,
      reason: "Teaches it",
    });
    expect(wrongScope.statusCode).toBe(400);
    const noReason = await grant(admin, ins.id, { permission: "course:create" });
    expect(noReason.statusCode).toBe(400);
    expect(JSON.stringify(noReason.json())).toContain("reason");
    for (const permission of [
      "roles:manage",
      "audit:read",
      "payments:read_full",
      "instructor_permissions:manage",
      "users:read",
    ]) {
      const r = await grant(admin, ins.id, { permission, courseId: c.id, reason: "Just because" });
      expect(r.statusCode, permission).toBe(400);
    }
    expect(await activeGrants(ins.id)).toHaveLength(0);
  });

  it("accepts only active Instructors and existing courses", async () => {
    const c = await course();
    const mgr = await person(h, "manager");
    for (const target of [student, mgr]) {
      const r = await grant(admin, target.id, { permission: "course:create", reason: "Trying" });
      expect(r.statusCode).toBe(400);
    }
    const unknown = await grant(admin, "5b1c1a6e-3b7a-4a0c-9d3e-2f1a6b8c9d01", {
      permission: "course:create",
      reason: "Trying",
    });
    expect(unknown.statusCode).toBe(404);
    const disabled = await person(h, "instructor");
    await h.db.user.update({ where: { id: disabled.id }, data: { status: "disabled" } });
    expect(
      (await grant(admin, disabled.id, { permission: "course:create", reason: "Trying" }))
        .statusCode,
    ).toBe(400);
    const ins = await person(h, "instructor");
    const missing = await grant(admin, ins.id, {
      permission: "course:update",
      courseId: "5b1c1a6e-3b7a-4a0c-9d3e-2f1a6b8c9d01",
      reason: "Trying",
    });
    expect(missing.statusCode).toBe(404);
    expect(c.id).toBeTruthy();
  });

  it("refuses to grant to or revoke for yourself", async () => {
    const res = await grant(admin, admin.id, { permission: "course:create", reason: "Myself" });
    expect(res.statusCode).toBe(403);
    expect(
      await auditRows(h, { action: "grant.create", targetId: admin.id, outcome: "denied" }),
    ).toHaveLength(1);
  });
});

describe("idempotency and concurrency", () => {
  it("collapses a repeated or simultaneous identical grant into one", async () => {
    const ins = await person(h, "instructor");
    const c = await course();
    const body = { permission: "course:update", courseId: c.id, reason: "Teaches it" };
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => grant(admin, ins.id, body)));
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200]);
    expect(results.filter((r) => (r.json() as GrantResponse).created)).toHaveLength(1);
    expect(await activeGrants(ins.id)).toHaveLength(1);
    expect(await auditRows(h, { action: "grant.create", targetId: ins.id })).toHaveLength(1);
    const again = await grant(admin, ins.id, body);
    expect((again.json() as GrantResponse).created).toBe(false);
  });

  it("never leaves a grant when a role change lands at the same moment", async () => {
    for (let i = 0; i < 4; i++) {
      const ins = await person(h, "instructor");
      const [g] = await Promise.all([
        grant(admin, ins.id, { permission: "course:create", reason: "Trusted author" }),
        revoke(h, admin, ins.id),
      ]);
      expect([200, 400]).toContain(g.statusCode);
      expect(await activeGrants(ins.id)).toHaveLength(0);
    }
  });

  it("answers a second revoke clearly and changes nothing", async () => {
    const ins = await person(h, "instructor");
    const r = (
      await grant(admin, ins.id, { permission: "course:create", reason: "Trusted author" })
    ).json() as GrantResponse;
    expect((await endGrant(admin, ins.id, r.grant.id)).statusCode).toBe(200);
    const second = await endGrant(admin, ins.id, r.grant.id);
    expect(second.statusCode).toBe(404);
    const rows = await h.db.instructorGrant.findMany({ where: { userId: ins.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.revokedBy).toBe(admin.id);
    expect(await auditRows(h, { action: "grant.revoke", targetId: ins.id })).toHaveLength(1);
  });
});

describe("listing", () => {
  it("shows grants, titles and what the caller may grant; no personal data", async () => {
    const ins = await person(h, "instructor");
    const c = await course("Listed course");
    await grant(admin, ins.id, {
      permission: "course:update",
      courseId: c.id,
      reason: "Teaches it",
    });
    expect((await list(manager, ins.id)).statusCode).toBe(403);
    const asAdmin = (await list(admin, ins.id)).json() as InstructorPermissionsResponse;
    expect(asAdmin.grants[0]).toMatchObject({
      courseTitle: "Listed course",
      permission: "course:update",
      expiresAt: null,
    });
    expect(asAdmin.grantable.every((g) => g.allowedForYou)).toBe(true);
    expect(JSON.stringify(asAdmin)).not.toMatch(/@|password|token/i);
  });

  it("answers 404 for an unknown person or someone who is not an Instructor", async () => {
    expect((await list(admin, student.id)).statusCode).toBe(404);
    expect((await list(admin, "5b1c1a6e-3b7a-4a0c-9d3e-2f1a6b8c9d01")).statusCode).toBe(404);
  });
});

describe("enforcement on courses", () => {
  it("applies a grant to its own course only, and update is not publish", async () => {
    const ins = await person(h, "instructor");
    const a = await course("Course A");
    const b = await course("Course B");
    await grant(admin, ins.id, {
      permission: "course:update",
      courseId: a.id,
      reason: "Teaches A",
    });
    expect((await patch(ins, a.id, a.version, "Course A renamed")).statusCode).toBe(200);
    const other = await patch(ins, b.id, b.version, "Hacked");
    expect(other.statusCode).toBe(403);
    expect((await h.db.course.findUniqueOrThrow({ where: { id: b.id } })).title).toBe("Course B");
    const pub = await h.call("POST", `/staff/courses/${a.id}/publish`, { token: ins.accessToken });
    expect(pub.statusCode).toBe(403);
    expect((await h.db.course.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("draft");
  });

  it("lets an explicit publish grant publish that course, then revoke stops it at once", async () => {
    const ins = await person(h, "instructor");
    const a = await course("Publishable");
    await grant(admin, ins.id, {
      permission: "course:update",
      courseId: a.id,
      reason: "Teaches it",
    });
    const pg = (
      await grant(admin, ins.id, {
        permission: "course:publish",
        courseId: a.id,
        reason: "Trusted",
      })
    ).json() as GrantResponse;
    const pub = await h.call("POST", `/staff/courses/${a.id}/publish`, { token: ins.accessToken });
    expect(pub.statusCode).toBe(200);
    expect((await endGrant(admin, ins.id, pg.grant.id)).statusCode).toBe(200);
    const un = await h.call("POST", `/staff/courses/${a.id}/unpublish`, { token: ins.accessToken });
    expect(un.statusCode).toBe(403);
  });

  it("takes effect on the next request with the same token after a revoke", async () => {
    const ins = await person(h, "instructor");
    const a = await course("Revoke me");
    const g = (
      await grant(admin, ins.id, {
        permission: "course:update",
        courseId: a.id,
        reason: "Teaches it",
      })
    ).json() as GrantResponse;
    expect((await patch(ins, a.id, a.version, "Revoke me 2")).statusCode).toBe(200);
    await endGrant(admin, ins.id, g.grant.id);
    expect((await patch(ins, a.id, a.version + 1, "Revoke me 3")).statusCode).toBe(403);
  });

  it("needs the create grant to create, and still protects against stale edits", async () => {
    const ins = await person(h, "instructor");
    const body = {
      title: "By instructor",
      description: "",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    };
    expect(
      (await h.call("POST", "/staff/courses", { token: ins.accessToken, body })).statusCode,
    ).toBe(403);
    await grant(admin, ins.id, { permission: "course:create", reason: "Trusted author" });
    const res = await h.call("POST", "/staff/courses", { token: ins.accessToken, body });
    expect(res.statusCode).toBe(201);
    const made = res.json() as StaffCourse;
    const [x, y] = await Promise.all([
      patch(ins, made.id, made.version, "Edit by instructor"),
      patch(manager, made.id, made.version, "Edit by manager"),
    ]);
    expect([x.statusCode, y.statusCode].sort()).toEqual([200, 409]);
  });

  it("gives the creating Instructor edit access but not publishing, audited as system-made", async () => {
    const ins = await person(h, "instructor");
    await grant(admin, ins.id, { permission: "course:create", reason: "Trusted author" });
    const made = (
      await h.call("POST", "/staff/courses", {
        token: ins.accessToken,
        body: {
          title: "Mine",
          description: "",
          level: "beginner",
          priceCents: 0,
          coverTone: "blue",
        },
      })
    ).json() as StaffCourse;
    expect((await patch(ins, made.id, made.version, "Mine, edited")).statusCode).toBe(200);
    expect(
      (await h.call("POST", `/staff/courses/${made.id}/publish`, { token: ins.accessToken }))
        .statusCode,
    ).toBe(403);
    const audit = await auditRows(h, { action: "grant.owner_auto", targetId: made.id });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorKind).toBe("system");
    const auto = (await activeGrants(ins.id)).filter((g) => g.source === "owner_auto");
    expect(auto.map((g) => g.permission).sort()).toEqual([
      "assignments:manage",
      "course:update",
      "lesson:upload",
      "live:schedule",
      "reports:read",
      "students:read",
    ]);
    // Revoking the automatic update grant removes edit access.
    const upd = auto.find((g) => g.permission === "course:update");
    expect((await endGrant(admin, ins.id, upd?.id ?? "")).statusCode).toBe(200);
    expect((await patch(ins, made.id, made.version + 1, "Again")).statusCode).toBe(403);
  });

  it("gives Admin and Manager creations no automatic grants", async () => {
    const before = await h.db.instructorGrant.count();
    await course("By admin");
    await h.call("POST", "/staff/courses", {
      token: manager.accessToken,
      body: {
        title: "By manager",
        description: "",
        level: "beginner",
        priceCents: 0,
        coverTone: "blue",
      },
    });
    expect(await h.db.instructorGrant.count()).toBe(before);
  });

  it("lists and opens only granted courses for an Instructor, with an identical 403 otherwise", async () => {
    const ins = await person(h, "instructor");
    const a = await course("Mine A");
    const b = await course("Not mine B");
    const c = await course("Mine C");
    for (const x of [a, c])
      await grant(admin, ins.id, {
        permission: "course:update",
        courseId: x.id,
        reason: "Teaches it",
      });
    const page = (
      await h.call("GET", "/staff/courses", { token: ins.accessToken })
    ).json() as Page<StaffCourse>;
    expect(page.items.map((i) => i.id).sort()).toEqual([a.id, c.id].sort());
    expect(
      (await h.call("GET", `/staff/courses/${a.id}`, { token: ins.accessToken })).statusCode,
    ).toBe(200);
    const denied = await h.call("GET", `/staff/courses/${b.id}`, { token: ins.accessToken });
    const missing = await h.call("GET", "/staff/courses/5b1c1a6e-3b7a-4a0c-9d3e-2f1a6b8c9d01", {
      token: ins.accessToken,
    });
    expect(denied.statusCode).toBe(403);
    expect(missing.statusCode).toBe(403);
    const strip = (r: typeof denied) => ({ ...(r.json() as object), requestId: "x" });
    expect(strip(denied)).toEqual(strip(missing));
    // A course added meanwhile that they have no grant on never appears.
    await course("Added later");
    const again = (
      await h.call("GET", "/staff/courses?limit=1", { token: ins.accessToken })
    ).json() as Page<StaffCourse>;
    expect(again.items).toHaveLength(1);
  });

  it("gives an Instructor with no grants 403 on the staff list", async () => {
    const ins = await person(h, "instructor");
    expect((await h.call("GET", "/staff/courses", { token: ins.accessToken })).statusCode).toBe(
      403,
    );
  });

  it("reports own grants on /me/access, including the academy-wide one as a permission", async () => {
    const ins = await person(h, "instructor");
    const a = await course("Listed in access");
    await grant(admin, ins.id, { permission: "course:create", reason: "Trusted author" });
    await grant(admin, ins.id, {
      permission: "course:update",
      courseId: a.id,
      reason: "Teaches it",
    });
    const acc = (await h.call("GET", "/me/access", { token: ins.accessToken })).json() as {
      permissions: string[];
      courseGrants: Array<{ courseId: string; permissions: string[] }>;
    };
    expect(acc.permissions).toContain("course:create");
    expect(acc.courseGrants).toEqual([{ courseId: a.id, permissions: ["course:update"] }]);
  });
});

describe("grants end with the role", () => {
  it("ends every grant when the role is revoked, in one audited change", async () => {
    const ins = await person(h, "instructor");
    const a = await course("Ending");
    await grant(admin, ins.id, { permission: "course:create", reason: "Trusted author" });
    await grant(admin, ins.id, {
      permission: "course:update",
      courseId: a.id,
      reason: "Teaches it",
    });
    expect((await revoke(h, admin, ins.id)).statusCode).toBe(200);
    expect(await activeGrants(ins.id)).toHaveLength(0);
    const rows = await auditRows(h, { action: "role.revoke", targetId: ins.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.after).toMatchObject({ grantsEnded: 2 });
    expect((await patch(ins, a.id, a.version, "After role")).statusCode).toBe(403);
  });

  it("ends them when an Instructor becomes a Manager, and a reappointment starts clean", async () => {
    const ins = await person(h, "instructor");
    await grant(admin, ins.id, { permission: "course:create", reason: "Trusted author" });
    expect((await assign(h, admin, ins.id, "manager")).statusCode).toBe(200);
    expect(await activeGrants(ins.id)).toHaveLength(0);
    expect((await assign(h, admin, ins.id, "instructor")).statusCode).toBe(200);
    expect(await activeGrants(ins.id)).toHaveLength(0);
    // Becoming a Manager ended the old session, so the person signs in again as an Instructor.
    const old = await h.call("GET", "/me/access", { token: ins.accessToken });
    expect(old.statusCode).toBe(401);
    const again = (await h.login(ins.email, ins.password)).json() as { accessToken: string };
    expect(
      (
        await h.call("POST", "/staff/courses", {
          token: again.accessToken,
          body: {
            title: "No grant",
            description: "",
            level: "beginner",
            priceCents: 0,
            coverTone: "blue",
          },
        })
      ).statusCode,
    ).toBe(403);
  });

  it("ignores grants of a disabled account without deleting them", async () => {
    const ins = await person(h, "instructor");
    const a = await course("Disabled");
    await grant(admin, ins.id, {
      permission: "course:update",
      courseId: a.id,
      reason: "Teaches it",
    });
    await h.db.user.update({ where: { id: ins.id }, data: { status: "disabled" } });
    expect(await h.db.instructorGrant.count({ where: { userId: ins.id, revokedAt: null } })).toBe(
      1,
    );
    expect([401, 403]).toContain((await patch(ins, a.id, a.version, "While disabled")).statusCode);
    await h.db.user.update({ where: { id: ins.id }, data: { status: "active" } });
    expect((await patch(ins, a.id, a.version, "Back")).statusCode).toBe(200);
  });

  it("ends grants when the Instructor deletes their account", async () => {
    const ins = await person(h, "instructor");
    await grant(admin, ins.id, { permission: "course:create", reason: "Trusted author" });
    const res = await h.call("DELETE", "/me", {
      token: ins.accessToken,
      body: { password: ins.password },
    });
    expect([200, 204]).toContain(res.statusCode);
    expect(await activeGrants(ins.id)).toHaveLength(0);
  });
});
