import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  errorEnvelopeSchema,
  type LessonOutline,
  type PublicCourseDetail,
  type PublicLesson,
  type StaffLesson,
  type StaffLessonList,
} from "@chartnexa/api-contracts";
import { PrismaService } from "../src/database/prisma.service.js";
import { AuditService } from "../src/modules/access/index.js";
import { CoursesService } from "../src/modules/courses/index.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, stripRequestId, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let admin: Person;
let manager: Person;
let student: Person;
let instructor: Person;
let courses: CoursesService;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
  courses = h.t.app.get(CoursesService);
  admin = await person(h, "admin");
  manager = await person(h, "manager");
  student = await person(h);
  instructor = await person(h, "instructor");
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

let keyCounter = 0;
const key = () => `test-key-${++keyCounter}-${Math.random().toString(36).slice(2, 10)}`;
const mkCourse = async (publish = false) => {
  const c = await courses.create(
    admin.id,
    {
      title: "Lessons course",
      description: "A complete description",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    } as never,
    "req-course",
  );
  return publish ? courses.publish(admin.id, c.id, "req-publish") : c;
};
const staff = (
  p: Person | undefined,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  body?: unknown,
) =>
  h.call(method, url, {
    ...(p ? { token: p.accessToken } : {}),
    ...(body !== undefined ? { body } : {}),
  });
const add = (p: Person | undefined, courseId: string, over: Record<string, unknown> = {}) =>
  staff(p, "POST", `/staff/courses/${courseId}/lessons`, {
    title: "Lesson",
    body: "Body text",
    idempotencyKey: key(),
    ...over,
  });
const addOk = async (courseId: string, over: Record<string, unknown> = {}) => {
  const res = await add(admin, courseId, over);
  expect(res.statusCode).toBe(201);
  return res.json() as StaffLesson;
};
const staffList = async (courseId: string) =>
  ((await staff(admin, "GET", `/staff/courses/${courseId}/lessons`)).json() as StaffLessonList)
    .items;
const positions = async (courseId: string) =>
  (await h.db.lesson.findMany({ where: { courseId }, orderBy: { position: "asc" } })).map(
    (l) => l.position,
  );
const grantLesson = (userId: string, courseId: string) =>
  h.db.instructorGrant.create({
    data: { userId, permission: "lesson:upload", courseId, reason: "Test grant" },
  });

describe("adding lessons", () => {
  it("lets an Admin and a Manager add lessons at the end and audits each one", async () => {
    const c = await mkCourse();
    for (const who of [admin, manager]) {
      const res = await add(who, c.id, { title: `  By ${who.id.slice(0, 4)}  `, isPreview: true });
      expect(res.statusCode).toBe(201);
      const l = res.json() as StaffLesson;
      expect(l).toMatchObject({ courseId: c.id, isPreview: true, version: 1, body: "Body text" });
      expect(l.title).toBe(`By ${who.id.slice(0, 4)}`);
      const rows = await auditRows(h, { targetId: l.id });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: "lesson.create",
        actorUserId: who.id,
        outcome: "success",
      });
    }
    expect(await positions(c.id)).toEqual([1, 2]);
  });

  it("works for draft and published courses alike", async () => {
    const draft = await mkCourse();
    const published = await mkCourse(true);
    expect((await add(admin, draft.id)).statusCode).toBe(201);
    expect((await add(admin, published.id)).statusCode).toBe(201);
  });

  it("names the invalid fields and saves nothing", async () => {
    const c = await mkCourse();
    for (const bad of [
      { title: "" },
      { title: "x".repeat(121) },
      { body: "y".repeat(20_001) },
      { body: "bell\u0007" },
      { idempotencyKey: "short" },
      { extra: true },
    ]) {
      const res = await add(admin, c.id, bad);
      expect(res.statusCode, JSON.stringify(bad).slice(0, 40)).toBe(400);
      expect(errorEnvelopeSchema.parse(res.json()).code).toBe("VALIDATION_FAILED");
    }
    expect(await h.db.lesson.count({ where: { courseId: c.id } })).toBe(0);
  });

  it("stores markup as typed text", async () => {
    const c = await mkCourse();
    const l = await addOk(c.id, { body: "<img src=x onerror=alert(1)>" });
    expect(l.body).toBe("<img src=x onerror=alert(1)>");
  });

  it("refuses a 201st lesson with a stable code", async () => {
    const c = await mkCourse();
    await h.db.lesson.createMany({
      data: Array.from({ length: 200 }, (_, i) => ({
        courseId: c.id,
        title: `L${i + 1}`,
        position: i + 1,
      })),
    });
    const res = await add(admin, c.id);
    expect(res.statusCode).toBe(409);
    expect(errorEnvelopeSchema.parse(res.json()).code).toBe("LESSON_LIMIT_REACHED");
    expect(await h.db.lesson.count({ where: { courseId: c.id } })).toBe(200);
  });

  it("answers 404 for an unknown course", async () => {
    const res = await add(admin, "00000000-0000-4000-8000-000000000000");
    expect(res.statusCode).toBe(404);
  });
});

describe("who may author lessons", () => {
  it("refuses signed-out callers (401) and Students (403) on every staff route", async () => {
    const c = await mkCourse();
    const l = await addOk(c.id);
    const calls: [string, string, unknown?][] = [
      ["GET", `/staff/courses/${c.id}/lessons`],
      ["POST", `/staff/courses/${c.id}/lessons`, { title: "x", idempotencyKey: key() }],
      ["GET", `/staff/courses/${c.id}/lessons/${l.id}`],
      ["PATCH", `/staff/courses/${c.id}/lessons/${l.id}`, { expectedVersion: 1, title: "x" }],
      ["PUT", `/staff/courses/${c.id}/lessons/order`, { lessonIds: [l.id] }],
      ["DELETE", `/staff/courses/${c.id}/lessons/${l.id}`],
    ];
    for (const [method, url, body] of calls) {
      const out = await staff(undefined, method as "GET", url, body);
      expect(out.statusCode, `${method} ${url} signed out`).toBe(401);
      const st = await staff(student, method as "GET", url, body);
      expect(st.statusCode, `${method} ${url} student`).toBe(403);
    }
    expect(await staffList(c.id)).toHaveLength(1);
    expect((await staffList(c.id))[0]?.title).toBe("Lesson");
  });

  it("refuses an Instructor without a grant, with the same body for real and missing courses", async () => {
    const c = await mkCourse();
    const real = await add(instructor, c.id);
    const missing = await add(instructor, "00000000-0000-4000-8000-000000000000");
    expect(real.statusCode).toBe(403);
    expect(missing.statusCode).toBe(403);
    expect(stripRequestId(real)).toEqual(stripRequestId(missing));
    expect(await h.db.lesson.count({ where: { courseId: c.id } })).toBe(0);
  });

  it("refuses an Instructor granted another course", async () => {
    const mine = await mkCourse();
    const other = await mkCourse();
    await grantLesson(instructor.id, mine.id);
    expect((await add(instructor, mine.id)).statusCode).toBe(201);
    expect((await add(instructor, other.id)).statusCode).toBe(403);
    expect((await staff(instructor, "GET", `/staff/courses/${other.id}/lessons`)).statusCode).toBe(
      403,
    );
  });

  it("does not let a course update or publish grant stand in for the lesson grant", async () => {
    const ins = await person(h, "instructor");
    const c = await mkCourse();
    await h.db.instructorGrant.create({
      data: { userId: ins.id, permission: "course:update", courseId: c.id, reason: "Test grant" },
    });
    await h.db.instructorGrant.create({
      data: { userId: ins.id, permission: "course:publish", courseId: c.id, reason: "Test grant" },
    });
    expect((await add(ins, c.id)).statusCode).toBe(403);
  });

  it("stops an Instructor on the next request once the grant ends, with the same token", async () => {
    const ins = await person(h, "instructor");
    const c = await mkCourse();
    const g = await grantLesson(ins.id, c.id);
    const l = (await add(ins, c.id)).json() as StaffLesson;
    await h.db.instructorGrant.update({ where: { id: g.id }, data: { revokedAt: new Date() } });
    const res = await staff(ins, "PATCH", `/staff/courses/${c.id}/lessons/${l.id}`, {
      expectedVersion: 1,
      title: "Changed after revoke",
    });
    expect(res.statusCode).toBe(403);
    expect((await h.db.lesson.findUniqueOrThrow({ where: { id: l.id } })).title).toBe("Lesson");
  });

  it("records the Instructor as the actor and lets them edit, reorder and delete", async () => {
    const ins = await person(h, "instructor");
    const c = await mkCourse();
    await grantLesson(ins.id, c.id);
    const a = (await add(ins, c.id, { title: "A" })).json() as StaffLesson;
    const b = (await add(ins, c.id, { title: "B" })).json() as StaffLesson;
    expect(
      (
        await staff(ins, "PATCH", `/staff/courses/${c.id}/lessons/${a.id}`, {
          expectedVersion: 1,
          title: "A2",
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await staff(ins, "PUT", `/staff/courses/${c.id}/lessons/order`, {
          lessonIds: [b.id, a.id],
        })
      ).statusCode,
    ).toBe(200);
    expect((await staff(ins, "DELETE", `/staff/courses/${c.id}/lessons/${b.id}`)).statusCode).toBe(
      204,
    );
    const rows = await auditRows(h, { actorUserId: ins.id });
    expect(rows.map((r) => r.action)).toEqual([
      "lesson.create",
      "lesson.create",
      "lesson.update",
      "lesson.reorder",
      "lesson.delete",
    ]);
  });

  it("answers 404 when the lesson is asked for under another course", async () => {
    const c1 = await mkCourse();
    const c2 = await mkCourse();
    const l = await addOk(c1.id);
    const url = `/staff/courses/${c2.id}/lessons/${l.id}`;
    expect((await staff(admin, "GET", url)).statusCode).toBe(404);
    expect((await staff(admin, "PATCH", url, { expectedVersion: 1, title: "x" })).statusCode).toBe(
      404,
    );
    expect((await staff(admin, "DELETE", url)).statusCode).toBe(404);
    expect(await h.db.lesson.count({ where: { id: l.id } })).toBe(1);
  });
});

describe("editing lessons", () => {
  it("saves a change, bumps the version and audits field names without the text", async () => {
    const c = await mkCourse();
    const l = await addOk(c.id);
    const secret = "SECRET-LESSON-TEXT-4711";
    const res = await staff(admin, "PATCH", `/staff/courses/${c.id}/lessons/${l.id}`, {
      expectedVersion: 1,
      body: secret,
      isPreview: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ version: 2, body: secret, isPreview: true });
    const rows = await auditRows(h, { targetId: l.id, action: "lesson.update" });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain(secret);
    expect(rows[0]?.after).toMatchObject({ changedFields: ["body", "isPreview"] });
    expect(h.t.logs()).not.toContain(secret);
  });

  it("does nothing, and writes no audit row, when nothing changed", async () => {
    const c = await mkCourse();
    const l = await addOk(c.id);
    const res = await staff(admin, "PATCH", `/staff/courses/${c.id}/lessons/${l.id}`, {
      expectedVersion: 1,
      title: l.title,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as StaffLesson).version).toBe(1);
    expect(await auditRows(h, { targetId: l.id, action: "lesson.update" })).toHaveLength(0);
  });

  it("refuses an edit from an older version", async () => {
    const c = await mkCourse();
    const l = await addOk(c.id);
    const url = `/staff/courses/${c.id}/lessons/${l.id}`;
    expect(
      (await staff(admin, "PATCH", url, { expectedVersion: 1, title: "First" })).statusCode,
    ).toBe(200);
    const stale = await staff(manager, "PATCH", url, { expectedVersion: 1, title: "Second" });
    expect(stale.statusCode).toBe(409);
    expect((await h.db.lesson.findUniqueOrThrow({ where: { id: l.id } })).title).toBe("First");
  });

  it("lets exactly one of two simultaneous edits win", async () => {
    const c = await mkCourse();
    const l = await addOk(c.id);
    const url = `/staff/courses/${c.id}/lessons/${l.id}`;
    const results = await Promise.all([
      staff(admin, "PATCH", url, { expectedVersion: 1, title: "From admin" }),
      staff(manager, "PATCH", url, { expectedVersion: 1, title: "From manager" }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect((await h.db.lesson.findUniqueOrThrow({ where: { id: l.id } })).version).toBe(2);
  });

  it("refuses the write when someone else's edit lands between reading and writing", async () => {
    const c = await mkCourse();
    const l = await addOk(c.id);
    const db = h.t.app.get(PrismaService);
    const realTransaction = db.$transaction.bind(db) as (...a: unknown[]) => Promise<unknown>;
    // Right after the service reads the lesson, a competing edit commits from another connection.
    const spy = vi.spyOn(db, "$transaction").mockImplementationOnce(((fn: (tx: never) => unknown) =>
      realTransaction(async (tx: Record<string, unknown>) =>
        fn(
          new Proxy(tx, {
            get(target, prop) {
              if (prop !== "lesson") return target[prop as string];
              const lessons = target["lesson"] as Record<string, (...a: unknown[]) => unknown>;
              return new Proxy(lessons, {
                get(t, method) {
                  if (method !== "findFirst") return (t[method as string] as () => unknown).bind(t);
                  return async (...args: unknown[]) => {
                    const row = await t["findFirst"]!(...args);
                    await h.db.lesson.update({
                      where: { id: l.id },
                      data: { title: "Competing edit", version: { increment: 1 } },
                    });
                    return row;
                  };
                },
              });
            },
          }) as never,
        ),
      )) as never);
    try {
      const res = await staff(admin, "PATCH", `/staff/courses/${c.id}/lessons/${l.id}`, {
        expectedVersion: 1,
        title: "Late edit",
      });
      expect(res.statusCode).toBe(409);
    } finally {
      spy.mockRestore();
    }
    const row = await h.db.lesson.findUniqueOrThrow({ where: { id: l.id } });
    expect([row.title, row.version]).toEqual(["Competing edit", 2]);
    expect(await auditRows(h, { targetId: l.id, action: "lesson.update" })).toHaveLength(0);
  });

  it("answers 404 for an edit of a lesson that was deleted meanwhile", async () => {
    const c = await mkCourse();
    const l = await addOk(c.id);
    await staff(admin, "DELETE", `/staff/courses/${c.id}/lessons/${l.id}`);
    const res = await staff(admin, "PATCH", `/staff/courses/${c.id}/lessons/${l.id}`, {
      expectedVersion: 1,
      title: "Too late",
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("order stays a gapless sequence", () => {
  it("gives simultaneous adds distinct consecutive positions", async () => {
    const c = await mkCourse();
    const results = await Promise.all(Array.from({ length: 12 }, () => add(admin, c.id)));
    expect(results.every((r) => r.statusCode === 201)).toBe(true);
    expect(await positions(c.id)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it("returns the same lesson for a repeated add with one key, even when simultaneous", async () => {
    const c = await mkCourse();
    const k = key();
    const first = await add(admin, c.id, { idempotencyKey: k });
    const again = await add(admin, c.id, { idempotencyKey: k });
    expect(first.statusCode).toBe(201);
    expect((again.json() as StaffLesson).id).toBe((first.json() as StaffLesson).id);
    const k2 = key();
    const both = await Promise.all([
      add(admin, c.id, { idempotencyKey: k2 }),
      add(admin, c.id, { idempotencyKey: k2 }),
    ]);
    expect(new Set(both.map((r) => (r.json() as StaffLesson).id)).size).toBe(1);
    expect(await h.db.lesson.count({ where: { courseId: c.id } })).toBe(2);
  });

  it("scopes a key to its course", async () => {
    const c1 = await mkCourse();
    const c2 = await mkCourse();
    const k = key();
    await add(admin, c1.id, { idempotencyKey: k });
    await add(admin, c2.id, { idempotencyKey: k });
    expect(await h.db.lesson.count({ where: { courseId: c1.id } })).toBe(1);
    expect(await h.db.lesson.count({ where: { courseId: c2.id } })).toBe(1);
  });

  it("reorders to the given order and audits once", async () => {
    const c = await mkCourse();
    const a = await addOk(c.id, { title: "A" });
    const b = await addOk(c.id, { title: "B" });
    const d = await addOk(c.id, { title: "C" });
    const res = await staff(admin, "PUT", `/staff/courses/${c.id}/lessons/order`, {
      lessonIds: [d.id, a.id, b.id],
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as StaffLessonList).items.map((l) => [l.title, l.position])).toEqual([
      ["C", 1],
      ["A", 2],
      ["B", 3],
    ]);
    expect(await auditRows(h, { targetId: c.id, action: "lesson.reorder" })).toHaveLength(1);
  });

  it("does not audit or change anything when the order is already right", async () => {
    const c = await mkCourse();
    const a = await addOk(c.id);
    const b = await addOk(c.id);
    const res = await staff(admin, "PUT", `/staff/courses/${c.id}/lessons/order`, {
      lessonIds: [a.id, b.id],
    });
    expect(res.statusCode).toBe(200);
    expect(await auditRows(h, { targetId: c.id, action: "lesson.reorder" })).toHaveLength(0);
  });

  it("refuses a stale, partial, extra or foreign list with 409 and keeps the order", async () => {
    const c = await mkCourse();
    const other = await mkCourse();
    const a = await addOk(c.id);
    const b = await addOk(c.id);
    const foreign = await addOk(other.id);
    const url = `/staff/courses/${c.id}/lessons/order`;
    for (const lessonIds of [
      [a.id],
      [b.id, a.id, foreign.id],
      [b.id, foreign.id],
      [b.id, "00000000-0000-4000-8000-000000000000"],
    ]) {
      const res = await staff(admin, "PUT", url, { lessonIds });
      expect(res.statusCode, JSON.stringify(lessonIds)).toBe(409);
      expect(errorEnvelopeSchema.parse(res.json()).code).toBe("LESSON_ORDER_CHANGED");
    }
    expect((await staffList(c.id)).map((l) => l.id)).toEqual([a.id, b.id]);
    expect((await staffList(other.id)).map((l) => l.position)).toEqual([1]);
  });

  it("refuses duplicate ids in the list as invalid", async () => {
    const c = await mkCourse();
    const a = await addOk(c.id);
    const res = await staff(admin, "PUT", `/staff/courses/${c.id}/lessons/order`, {
      lessonIds: [a.id, a.id],
    });
    expect(res.statusCode).toBe(400);
  });

  it("closes the gap when a lesson in the middle is deleted, and audits it", async () => {
    const c = await mkCourse();
    const a = await addOk(c.id, { title: "A" });
    const b = await addOk(c.id, { title: "B" });
    const d = await addOk(c.id, { title: "C" });
    const res = await staff(admin, "DELETE", `/staff/courses/${c.id}/lessons/${b.id}`);
    expect(res.statusCode).toBe(204);
    expect((await staffList(c.id)).map((l) => [l.id, l.position])).toEqual([
      [a.id, 1],
      [d.id, 2],
    ]);
    expect(await auditRows(h, { targetId: b.id, action: "lesson.delete" })).toHaveLength(1);
    expect(
      (await staff(admin, "DELETE", `/staff/courses/${c.id}/lessons/${b.id}`)).statusCode,
    ).toBe(404);
  });

  it("keeps the sequence valid when adds, deletes and a reorder run at the same time", async () => {
    const c = await mkCourse();
    const seeded: StaffLesson[] = [];
    for (let i = 0; i < 6; i++) seeded.push(await addOk(c.id, { title: `S${i}` }));
    const ids = seeded.map((l) => l.id);
    const results = await Promise.all([
      staff(admin, "PUT", `/staff/courses/${c.id}/lessons/order`, {
        lessonIds: [...ids].reverse(),
      }),
      add(admin, c.id),
      add(manager, c.id),
      staff(admin, "DELETE", `/staff/courses/${c.id}/lessons/${ids[2]}`),
      add(admin, c.id),
    ]);
    for (const r of results) expect([200, 201, 204, 409]).toContain(r.statusCode);
    const pos = await positions(c.id);
    expect(pos).toEqual(Array.from({ length: pos.length }, (_, i) => i + 1));
  });

  it("restores the key's lesson when the same key is used after that lesson was deleted", async () => {
    const c = await mkCourse();
    const k = key();
    const first = (await add(admin, c.id, { idempotencyKey: k })).json() as StaffLesson;
    await staff(admin, "DELETE", `/staff/courses/${c.id}/lessons/${first.id}`);
    const second = (await add(admin, c.id, { idempotencyKey: k })).json() as StaffLesson;
    expect(second.id).not.toBe(first.id);
    expect(second.position).toBe(1);
  });
});

describe("a failed audit write undoes the change", () => {
  it("rolls back create, update, reorder and delete", async () => {
    const c = await mkCourse();
    const a = await addOk(c.id, { title: "A" });
    const b = await addOk(c.id, { title: "B" });
    const audit = h.t.app.get(AuditService);
    const spy = vi.spyOn(audit, "record").mockRejectedValue(new Error("audit down"));
    try {
      expect((await add(admin, c.id)).statusCode).toBe(500);
      expect(
        (
          await staff(admin, "PATCH", `/staff/courses/${c.id}/lessons/${a.id}`, {
            expectedVersion: 1,
            title: "Changed",
          })
        ).statusCode,
      ).toBe(500);
      expect(
        (
          await staff(admin, "PUT", `/staff/courses/${c.id}/lessons/order`, {
            lessonIds: [b.id, a.id],
          })
        ).statusCode,
      ).toBe(500);
      expect(
        (await staff(admin, "DELETE", `/staff/courses/${c.id}/lessons/${a.id}`)).statusCode,
      ).toBe(500);
    } finally {
      spy.mockRestore();
    }
    const after = await staffList(c.id);
    expect(after.map((l) => [l.id, l.title, l.position, l.version])).toEqual([
      [a.id, "A", 1, 1],
      [b.id, "B", 2, 1],
    ]);
    expect(await h.db.lessonCreateKey.count({ where: { courseId: c.id } })).toBe(2);
  });
});

describe("public reading", () => {
  const publicGet = (url: string) => h.call("GET", url);

  it("shows the outline in order without any text", async () => {
    const c = await mkCourse(true);
    await addOk(c.id, { title: "One", body: "ONE-BODY", isPreview: true });
    await addOk(c.id, { title: "Two", body: "TWO-BODY" });
    const res = await publicGet(`/courses/${c.id}/lessons`);
    expect(res.statusCode).toBe(200);
    const out = res.json() as LessonOutline;
    expect(out.items.map((i) => [i.title, i.position, i.isPreview])).toEqual([
      ["One", 1, true],
      ["Two", 2, false],
    ]);
    expect(JSON.stringify(out)).not.toContain("BODY");
    for (const item of out.items) {
      expect(Object.keys(item).sort()).toEqual(["id", "isPreview", "position", "title"]);
    }
  });

  it("returns an empty outline for a published course with no lessons", async () => {
    const c = await mkCourse(true);
    const res = await publicGet(`/courses/${c.id}/lessons`);
    expect(res.statusCode).toBe(200);
    expect((res.json() as LessonOutline).items).toEqual([]);
  });

  it("returns the text of a free-preview lesson with no staff fields", async () => {
    const c = await mkCourse(true);
    const l = await addOk(c.id, { title: "Free", body: "Free text", isPreview: true });
    const res = await publicGet(`/courses/${c.id}/lessons/${l.id}`);
    expect(res.statusCode).toBe(200);
    const body = res.json() as PublicLesson;
    expect(body).toEqual({
      id: l.id,
      title: "Free",
      position: 1,
      isPreview: true,
      body: "Free text",
    });
  });

  it("refuses a locked lesson with ENROLLMENT_REQUIRED and no text", async () => {
    const c = await mkCourse(true);
    const l = await addOk(c.id, { body: "LOCKED-TEXT" });
    const res = await publicGet(`/courses/${c.id}/lessons/${l.id}`);
    expect(res.statusCode).toBe(403);
    expect(errorEnvelopeSchema.parse(res.json()).code).toBe("ENROLLMENT_REQUIRED");
    expect(res.body).not.toContain("LOCKED-TEXT");
    // Signed-in Students and staff get the same answer on the public route.
    const withToken = await h.call("GET", `/courses/${c.id}/lessons/${l.id}`, {
      token: student.accessToken,
    });
    expect(withToken.statusCode).toBe(403);
  });

  it("answers 404, identical to an unknown course, for a draft course", async () => {
    const draft = await mkCourse(false);
    const l = await addOk(draft.id, { isPreview: true });
    const unknown = "00000000-0000-4000-8000-000000000000";
    for (const [real, fake] of [
      [`/courses/${draft.id}/lessons`, `/courses/${unknown}/lessons`],
      [`/courses/${draft.id}/lessons/${l.id}`, `/courses/${unknown}/lessons/${l.id}`],
    ] as const) {
      const a = await publicGet(real);
      const b = await publicGet(fake);
      expect(a.statusCode).toBe(404);
      expect(stripRequestId(a)).toEqual(stripRequestId(b));
    }
  });

  it("hides outline and previews again as soon as the course is unpublished", async () => {
    const c = await mkCourse(true);
    const l = await addOk(c.id, { isPreview: true });
    expect((await publicGet(`/courses/${c.id}/lessons/${l.id}`)).statusCode).toBe(200);
    await courses.unpublish(admin.id, c.id, "req-unpublish");
    expect((await publicGet(`/courses/${c.id}/lessons`)).statusCode).toBe(404);
    expect((await publicGet(`/courses/${c.id}/lessons/${l.id}`)).statusCode).toBe(404);
  });

  it("answers 404 for a lesson under another published course and for a deleted lesson", async () => {
    const c1 = await mkCourse(true);
    const c2 = await mkCourse(true);
    const l = await addOk(c1.id, { isPreview: true });
    expect((await publicGet(`/courses/${c2.id}/lessons/${l.id}`)).statusCode).toBe(404);
    await staff(admin, "DELETE", `/staff/courses/${c1.id}/lessons/${l.id}`);
    expect((await publicGet(`/courses/${c1.id}/lessons/${l.id}`)).statusCode).toBe(404);
  });

  it("rejects ids that are not UUIDs", async () => {
    expect((await publicGet("/courses/nope/lessons")).statusCode).toBe(400);
    const c = await mkCourse(true);
    expect((await publicGet(`/courses/${c.id}/lessons/nope`)).statusCode).toBe(400);
  });

  it("puts lesson and preview counts on the course detail", async () => {
    const c = await mkCourse(true);
    let detail = (await publicGet(`/courses/${c.id}`)).json() as PublicCourseDetail;
    expect(detail).toMatchObject({ lessonCount: 0, previewCount: 0 });
    await addOk(c.id, { isPreview: true });
    await addOk(c.id, { isPreview: true });
    await addOk(c.id);
    detail = (await publicGet(`/courses/${c.id}`)).json() as PublicCourseDetail;
    expect(detail).toMatchObject({ lessonCount: 3, previewCount: 2 });
    expect(Object.keys(detail)).not.toContain("version");
  });
});

describe("staff reading", () => {
  it("lists every lesson with text in order for a draft course", async () => {
    const c = await mkCourse(false);
    await addOk(c.id, { title: "A", body: "Text A" });
    await addOk(c.id, { title: "B", body: "Text B" });
    const items = await staffList(c.id);
    expect(items.map((l) => [l.title, l.body, l.position])).toEqual([
      ["A", "Text A", 1],
      ["B", "Text B", 2],
    ]);
  });
});
