import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  errorEnvelopeSchema,
  type CourseStudent,
  type Entitlement,
  type GrantEntitlementResponse,
  type LessonOutline,
  type MyCourse,
  type Page,
  type PublicCourseDetail,
  type PublicLesson,
} from "@chartnexa/api-contracts";
import { AuditService } from "../src/modules/access/index.js";
import { CoursesService } from "../src/modules/courses/index.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, stripRequestId, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let admin: Person;
let manager: Person;
let instructor: Person;
let courses: CoursesService;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
  courses = h.t.app.get(CoursesService);
  admin = await person(h, "admin");
  manager = await person(h, "manager");
  instructor = await person(h, "instructor");
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

const REASON = "Paid by invoice";
let keyCounter = 0;
const mkCourse = async (publish = true) => {
  const c = await courses.create(
    admin.id,
    {
      title: "Entitlement course",
      description: "A complete description",
      level: "beginner",
      priceCents: 1000,
      coverTone: "blue",
    } as never,
    "req-course",
  );
  return publish ? courses.publish(admin.id, c.id, "req-publish") : c;
};
const mkLesson = (courseId: string, isPreview: boolean, body = "Lesson body") =>
  h.db.lesson.create({
    data: {
      courseId,
      title: isPreview ? "Preview lesson" : "Locked lesson",
      body,
      isPreview,
      position: ++keyCounter,
    },
  });
const call = (
  p: Person | undefined,
  method: "GET" | "POST",
  url: string,
  body?: unknown,
  token?: string,
) =>
  h.call(method, url, {
    ...((token ?? p?.accessToken) ? { token: (token ?? p?.accessToken) as string } : {}),
    ...(body !== undefined ? { body } : {}),
  });
const grant = (who: Person | undefined, courseId: string, userId: string, reason = REASON) =>
  call(who, "POST", `/staff/courses/${courseId}/entitlements`, { userId, reason });
const revoke = (
  who: Person | undefined,
  courseId: string,
  id: string,
  reason = "Access ended by request",
) => call(who, "POST", `/staff/courses/${courseId}/entitlements/${id}/revoke`, { reason });
const active = (userId: string, courseId: string) =>
  h.db.entitlement.count({ where: { userId, courseId, status: "active" } });
const granted = async (who: Person, courseId: string, userId: string) =>
  ((await grant(who, courseId, userId)).json() as GrantEntitlementResponse).entitlement;

describe("granting access", () => {
  it("lets an Admin and a Manager grant, and audits each grant with the reason and no email", async () => {
    const c = await mkCourse();
    for (const who of [admin, manager]) {
      const student = await person(h);
      const res = await grant(who, c.id, student.id);
      expect(res.statusCode).toBe(200);
      const body = res.json() as GrantEntitlementResponse;
      expect(body.created).toBe(true);
      expect(body.entitlement).toMatchObject({
        courseId: c.id,
        userId: student.id,
        source: "admin_grant",
        status: "active",
        grantReason: REASON,
        revokedAt: null,
      });
      expect(res.body).not.toContain(student.email);
      const rows = await auditRows(h, { targetId: body.entitlement.id });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: "entitlement.grant",
        actorUserId: who.id,
        outcome: "success",
        reason: REASON,
      });
      expect(JSON.stringify(rows[0])).not.toContain(student.email);
    }
  });

  it("changes nothing and writes no second audit record when repeated", async () => {
    const c = await mkCourse();
    const student = await person(h);
    const first = (await grant(admin, c.id, student.id)).json() as GrantEntitlementResponse;
    const again = (
      await grant(manager, c.id, student.id, "Another reason")
    ).json() as GrantEntitlementResponse;
    expect(again.created).toBe(false);
    expect(again.entitlement.id).toBe(first.entitlement.id);
    expect(again.entitlement.grantReason).toBe(REASON);
    expect(await active(student.id, c.id)).toBe(1);
    expect(
      await auditRows(h, { action: "entitlement.grant", targetId: first.entitlement.id }),
    ).toHaveLength(1);
  });

  it("ends with exactly one active entitlement when several grants arrive together", async () => {
    const c = await mkCourse();
    const student = await person(h);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => grant(i % 2 ? admin : manager, c.id, student.id)),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect(results.filter((r) => (r.json() as GrantEntitlementResponse).created)).toHaveLength(1);
    expect(await active(student.id, c.id)).toBe(1);
    expect(
      await auditRows(h, {
        action: "entitlement.grant",
        reason: REASON,
        targetType: "entitlement",
      }).then((rows) =>
        rows.filter((r) => (r.after as { userId?: string } | null)?.userId === student.id),
      ),
    ).toHaveLength(1);
  });

  it("creates a new active entitlement after a revoke and keeps the old one as history", async () => {
    const c = await mkCourse();
    const student = await person(h);
    const first = await granted(admin, c.id, student.id);
    expect((await revoke(admin, c.id, first.id)).statusCode).toBe(200);
    const second = (await grant(admin, c.id, student.id)).json() as GrantEntitlementResponse;
    expect(second.created).toBe(true);
    expect(second.entitlement.id).not.toBe(first.id);
    const all = await h.db.entitlement.findMany({ where: { userId: student.id, courseId: c.id } });
    expect(all.map((r) => r.status).sort()).toEqual(["active", "revoked"]);
  });

  it("refuses unknown courses (404), unknown and deleted people (404), and ineligible people (409)", async () => {
    const c = await mkCourse();
    const unverified = await person(h, undefined, false);
    const disabled = await person(h);
    await h.db.user.update({ where: { id: disabled.id }, data: { status: "disabled" } });
    const deleted = await person(h);
    await h.db.user.update({ where: { id: deleted.id }, data: { status: "deleted" } });
    const nobody = "00000000-0000-4000-8000-000000000000";
    const student = await person(h);

    expect((await grant(admin, nobody, student.id)).statusCode).toBe(404);
    expect((await grant(admin, c.id, nobody)).statusCode).toBe(404);
    expect((await grant(admin, c.id, deleted.id)).statusCode).toBe(404);
    expect((await grant(admin, c.id, unverified.id)).statusCode).toBe(409);
    expect((await grant(admin, c.id, disabled.id)).statusCode).toBe(409);
    expect(await h.db.entitlement.count({ where: { courseId: c.id } })).toBe(0);
  });

  it("names invalid input and creates nothing", async () => {
    const c = await mkCourse();
    const student = await person(h);
    for (const body of [
      { userId: student.id, reason: "ab" },
      { userId: student.id },
      { userId: "nope", reason: REASON },
      { userId: student.id, reason: REASON, source: "stripe" },
    ]) {
      const res = await call(admin, "POST", `/staff/courses/${c.id}/entitlements`, body);
      expect(res.statusCode).toBe(400);
      expect(errorEnvelopeSchema.parse(res.json()).code).toBe("VALIDATION_FAILED");
    }
    expect(await h.db.entitlement.count({ where: { courseId: c.id } })).toBe(0);
  });
});

describe("who may grant and revoke", () => {
  it("refuses signed-out callers (401), Students (403) and Instructors with any grants (403)", async () => {
    const c = await mkCourse();
    const student = await person(h);
    const other = await person(h);
    const e = await granted(admin, c.id, other.id);
    for (const perm of ["course:update", "lesson:upload", "students:read"]) {
      await h.db.instructorGrant.create({
        data: { userId: instructor.id, permission: perm, courseId: c.id, reason: "Test grant" },
      });
    }
    const attempts = [
      (p?: Person) => grant(p, c.id, student.id),
      (p?: Person) => revoke(p, c.id, e.id),
      (p?: Person) => call(p, "GET", `/staff/courses/${c.id}/entitlements`),
    ];
    for (const attempt of attempts) {
      expect((await attempt(undefined)).statusCode).toBe(401);
      expect((await attempt(student)).statusCode).toBe(403);
      expect((await attempt(instructor)).statusCode).toBe(403);
    }
    expect(await active(student.id, c.id)).toBe(0);
    expect(await active(other.id, c.id)).toBe(1);
    const denied = await auditRows(h, {
      action: "entitlement.grant",
      outcome: "denied",
      targetId: c.id,
    });
    expect(denied.length).toBeGreaterThanOrEqual(2);
  });
});

describe("revoking access", () => {
  it("ends access with who, when and why, and audits it once", async () => {
    const c = await mkCourse();
    const student = await person(h);
    const e = await granted(admin, c.id, student.id);
    const res = await revoke(manager, c.id, e.id, "Chargeback upheld");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: e.id, status: "revoked" });
    const row = await h.db.entitlement.findUniqueOrThrow({ where: { id: e.id } });
    expect(row).toMatchObject({
      status: "revoked",
      revokedBy: manager.id,
      revokeReason: "Chargeback upheld",
    });
    expect(row.revokedAt).toBeInstanceOf(Date);
    const rows = await auditRows(h, { action: "entitlement.revoke", targetId: e.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: manager.id, reason: "Chargeback upheld" });
  });

  it("changes nothing the second time and writes no second audit record", async () => {
    const c = await mkCourse();
    const student = await person(h);
    const e = await granted(admin, c.id, student.id);
    await revoke(admin, c.id, e.id, "First reason");
    const again = await revoke(manager, c.id, e.id, "Second reason");
    expect(again.statusCode).toBe(200);
    expect((await h.db.entitlement.findUniqueOrThrow({ where: { id: e.id } })).revokeReason).toBe(
      "First reason",
    );
    expect(await auditRows(h, { action: "entitlement.revoke", targetId: e.id })).toHaveLength(1);
  });

  it("answers 404 for an unknown entitlement or one under another course, and 400 for a short reason", async () => {
    const c1 = await mkCourse();
    const c2 = await mkCourse();
    const student = await person(h);
    const e = await granted(admin, c1.id, student.id);
    expect((await revoke(admin, c1.id, "00000000-0000-4000-8000-000000000000")).statusCode).toBe(
      404,
    );
    expect((await revoke(admin, c2.id, e.id)).statusCode).toBe(404);
    expect((await revoke(admin, c1.id, e.id, "ab")).statusCode).toBe(400);
    expect(await active(student.id, c1.id)).toBe(1);
  });

  it("never leaves two active entitlements when a revoke and a grant race", async () => {
    const c = await mkCourse();
    for (let i = 0; i < 4; i++) {
      const student = await person(h);
      const e = await granted(admin, c.id, student.id);
      const [rev, gr] = await Promise.all([
        revoke(admin, c.id, e.id),
        grant(manager, c.id, student.id),
      ]);
      expect(rev.statusCode).toBe(200);
      expect(gr.statusCode).toBe(200);
      const n = await active(student.id, c.id);
      expect(n === 0 || n === 1).toBe(true);
      const created = (gr.json() as GrantEntitlementResponse).created;
      // If the grant found the old row it was a no-op and the revoke may have ended it; if the
      // revoke ran first the grant made a new one. Either way the trail matches the table.
      const grants = await auditRows(h, { action: "entitlement.grant" }).then((rows) =>
        rows.filter((r) => (r.after as { userId?: string } | null)?.userId === student.id),
      );
      expect(grants.length).toBe(created ? 2 : 1);
    }
  });
});

describe("a failed audit write undoes the change", () => {
  it("rolls back grant and revoke", async () => {
    const c = await mkCourse();
    const student = await person(h);
    const other = await person(h);
    const e = await granted(admin, c.id, other.id);
    const spy = vi.spyOn(h.t.app.get(AuditService), "record").mockRejectedValue(new Error("down"));
    try {
      expect((await grant(admin, c.id, student.id)).statusCode).toBe(500);
      expect((await revoke(admin, c.id, e.id)).statusCode).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect(await active(student.id, c.id)).toBe(0);
    expect(await active(other.id, c.id)).toBe(1);
  });
});

describe("listing a course's people", () => {
  it("shows staff the name and email, newest first, and pages stably while people are added", async () => {
    const c = await mkCourse();
    const students = [];
    for (let i = 0; i < 5; i++) {
      const s = await person(h);
      students.push(s);
      await granted(admin, c.id, s.id);
      await new Promise((r) => setTimeout(r, 5));
    }
    const first = (
      await call(admin, "GET", `/staff/courses/${c.id}/entitlements?limit=2`)
    ).json() as Page<CourseStudent>;
    expect(first.items.map((i) => i.user.id)).toEqual([students[4]!.id, students[3]!.id]);
    expect(first.items[0]?.user.email?.toLowerCase()).toBe(students[4]!.email.toLowerCase());
    // Someone is added and someone is revoked between pages.
    const late = await person(h);
    await granted(admin, c.id, late.id);
    const second = (
      await call(
        manager,
        "GET",
        `/staff/courses/${c.id}/entitlements?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
      )
    ).json() as Page<CourseStudent>;
    expect(second.items.map((i) => i.user.id)).toEqual([students[2]!.id, students[1]!.id]);
    const third = (
      await call(
        admin,
        "GET",
        `/staff/courses/${c.id}/entitlements?limit=2&cursor=${encodeURIComponent(second.nextCursor!)}`,
      )
    ).json() as Page<CourseStudent>;
    expect(third.items.map((i) => i.user.id)).toEqual([students[0]!.id]);
    expect(third.nextCursor).toBeNull();
  });

  it("leaves revoked people out and rejects a tampered cursor and an unknown course", async () => {
    const c = await mkCourse();
    const s = await person(h);
    const e = await granted(admin, c.id, s.id);
    await revoke(admin, c.id, e.id);
    const list = (
      await call(admin, "GET", `/staff/courses/${c.id}/entitlements`)
    ).json() as Page<CourseStudent>;
    expect(list.items).toEqual([]);
    expect(
      (await call(admin, "GET", `/staff/courses/${c.id}/entitlements?cursor=bad.cursor`))
        .statusCode,
    ).toBe(400);
    expect(
      (await call(admin, "GET", "/staff/courses/00000000-0000-4000-8000-000000000000/entitlements"))
        .statusCode,
    ).toBe(404);
  });
});

describe("My Courses", () => {
  it("lists only my active courses, newest first, with public fields and no other person's data", async () => {
    const me = await person(h);
    const someoneElse = await person(h);
    const a = await mkCourse();
    const b = await mkCourse();
    const gone = await mkCourse();
    const notMine = await mkCourse();
    await granted(admin, a.id, me.id);
    await new Promise((r) => setTimeout(r, 5));
    await granted(admin, b.id, me.id);
    const e = await granted(admin, gone.id, me.id);
    await revoke(admin, gone.id, e.id);
    await granted(admin, notMine.id, someoneElse.id);

    const res = await call(me, "GET", "/me/courses");
    expect(res.statusCode).toBe(200);
    const page = res.json() as Page<MyCourse>;
    expect(page.items.map((i) => i.id)).toEqual([b.id, a.id]);
    expect(Object.keys(page.items[0]!).sort()).toEqual(
      [
        "coverTone",
        "currency",
        "enrolledAt",
        "id",
        "level",
        "onSale",
        "priceCents",
        "summary",
        "title",
      ].sort(),
    );
    expect(page.items.every((i) => i.onSale)).toBe(true);
    expect(res.body).not.toContain(someoneElse.id);
    expect(res.body).not.toContain(me.email);
  });

  it("is empty for a person with none, needs a sign-in, and pages", async () => {
    const me = await person(h);
    expect(((await call(me, "GET", "/me/courses")).json() as Page<MyCourse>).items).toEqual([]);
    expect((await call(undefined, "GET", "/me/courses")).statusCode).toBe(401);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const c = await mkCourse();
      ids.push(c.id);
      await granted(admin, c.id, me.id);
      await new Promise((r) => setTimeout(r, 5));
    }
    const p1 = (await call(me, "GET", "/me/courses?limit=2")).json() as Page<MyCourse>;
    expect(p1.items.map((i) => i.id)).toEqual([ids[2], ids[1]]);
    const p2 = (
      await call(me, "GET", `/me/courses?limit=2&cursor=${encodeURIComponent(p1.nextCursor!)}`)
    ).json() as Page<MyCourse>;
    expect(p2.items.map((i) => i.id)).toEqual([ids[0]]);
  });

  it("keeps an unpublished course, marked as not on sale", async () => {
    const me = await person(h);
    const c = await mkCourse();
    await granted(admin, c.id, me.id);
    await courses.unpublish(admin.id, c.id, "req-unpublish");
    const page = (await call(me, "GET", "/me/courses")).json() as Page<MyCourse>;
    expect(page.items).toMatchObject([{ id: c.id, onSale: false }]);
  });
});

describe("reading lessons with and without access", () => {
  it("opens locked lessons for owners and refuses everyone else with ENROLLMENT_REQUIRED", async () => {
    const c = await mkCourse();
    const locked = await mkLesson(c.id, false, "OWNER-ONLY TEXT");
    const url = `/courses/${c.id}/lessons/${locked.id}`;
    const owner = await person(h);
    const stranger = await person(h);
    await granted(admin, c.id, owner.id);

    const ok = await call(owner, "GET", url);
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as PublicLesson).body).toBe("OWNER-ONLY TEXT");
    for (const who of [stranger, undefined]) {
      const res = await call(who, "GET", url);
      expect(res.statusCode).toBe(403);
      expect(errorEnvelopeSchema.parse(res.json()).code).toBe("ENROLLMENT_REQUIRED");
      expect(res.body).not.toContain("OWNER-ONLY");
    }
  });

  it("applies a grant and a revoke on the very next request with the same token", async () => {
    const c = await mkCourse();
    const locked = await mkLesson(c.id, false);
    const url = `/courses/${c.id}/lessons/${locked.id}`;
    const student = await person(h); // token issued before any grant
    expect((await call(student, "GET", url)).statusCode).toBe(403);
    const e = await granted(admin, c.id, student.id);
    expect((await call(student, "GET", url)).statusCode).toBe(200);
    await revoke(admin, c.id, e.id);
    expect((await call(student, "GET", url)).statusCode).toBe(403);
  });

  it("keeps free previews open to everyone and treats bad tokens as signed out", async () => {
    const c = await mkCourse();
    const preview = await mkLesson(c.id, true, "Free text");
    const locked = await mkLesson(c.id, false);
    const student = await person(h);
    await h.db.session.update({
      where: { id: student.sessionId },
      data: { revokedAt: new Date() },
    });
    const tokens = [
      "garbage",
      "a.b.c",
      student.accessToken, // its session has been revoked
      "",
    ];
    for (const t of tokens) {
      const hdr = t === "" ? {} : { token: t };
      const p = await h.call("GET", `/courses/${c.id}/lessons/${preview.id}`, hdr);
      expect(p.statusCode, `preview with ${t.slice(0, 6)}`).toBe(200);
      const l = await h.call("GET", `/courses/${c.id}/lessons/${locked.id}`, hdr);
      expect(l.statusCode, `locked with ${t.slice(0, 6)}`).toBe(403);
      const o = await h.call("GET", `/courses/${c.id}/lessons`, hdr);
      expect(o.statusCode).toBe(200);
    }
    const malformed = await h.call("GET", `/courses/${c.id}/lessons/${preview.id}`, {
      headers: { authorization: "Bearer" },
    } as never);
    expect(malformed.statusCode).toBe(200);
  });

  it("does not let a disabled owner's still-valid token open a locked lesson", async () => {
    const c = await mkCourse();
    const locked = await mkLesson(c.id, false);
    const owner = await person(h);
    await granted(admin, c.id, owner.id);
    await h.db.user.update({ where: { id: owner.id }, data: { status: "disabled" } });
    expect((await call(owner, "GET", `/courses/${c.id}/lessons/${locked.id}`)).statusCode).toBe(
      403,
    );
  });
});

describe("unpublished courses and owners", () => {
  it("lets owners keep reading while everyone else gets the same 404 as an unknown course", async () => {
    const c = await mkCourse();
    const preview = await mkLesson(c.id, true);
    const locked = await mkLesson(c.id, false, "Still mine");
    const owner = await person(h);
    const stranger = await person(h);
    const e = await granted(admin, c.id, owner.id);
    await courses.unpublish(admin.id, c.id, "req-unpublish");

    const detail = await call(owner, "GET", `/courses/${c.id}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json() as PublicCourseDetail).toMatchObject({
      enrolled: true,
      onSale: false,
      publishedAt: null,
      lessonCount: 2,
    });
    const out = (await call(owner, "GET", `/courses/${c.id}/lessons`)).json() as LessonOutline;
    expect(out.items).toHaveLength(2);
    expect((await call(owner, "GET", `/courses/${c.id}/lessons/${locked.id}`)).statusCode).toBe(
      200,
    );
    expect((await call(owner, "GET", `/courses/${c.id}/lessons/${preview.id}`)).statusCode).toBe(
      200,
    );

    const unknown = "00000000-0000-4000-8000-000000000000";
    for (const who of [stranger, undefined]) {
      for (const [real, fake] of [
        [`/courses/${c.id}`, `/courses/${unknown}`],
        [`/courses/${c.id}/lessons`, `/courses/${unknown}/lessons`],
        [`/courses/${c.id}/lessons/${locked.id}`, `/courses/${unknown}/lessons/${locked.id}`],
      ] as const) {
        const a = await call(who, "GET", real);
        const b = await call(who, "GET", fake);
        expect(a.statusCode).toBe(404);
        expect(stripRequestId(a)).toEqual(stripRequestId(b));
      }
    }

    // Once access is revoked the owner is a stranger again.
    await revoke(admin, c.id, e.id);
    expect((await call(owner, "GET", `/courses/${c.id}`)).statusCode).toBe(404);
  });
});

describe("the enrolled flag on the course page", () => {
  it("is true only for a signed-in owner", async () => {
    const c = await mkCourse();
    const owner = await person(h);
    const stranger = await person(h);
    await granted(admin, c.id, owner.id);
    const flag = async (p?: Person) =>
      ((await call(p, "GET", `/courses/${c.id}`)).json() as PublicCourseDetail).enrolled;
    expect(await flag(owner)).toBe(true);
    expect(await flag(stranger)).toBe(false);
    expect(await flag(undefined)).toBe(false);
    const withBadToken = await call(undefined, "GET", `/courses/${c.id}`, undefined, "garbage");
    expect(withBadToken.statusCode).toBe(200);
    expect((withBadToken.json() as PublicCourseDetail).enrolled).toBe(false);
  });
});

export type { Entitlement };
