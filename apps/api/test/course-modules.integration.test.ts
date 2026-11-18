import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LessonOutline, PublicCourseDetail, StaffLessonList } from "@chartnexa/api-contracts";
import { CoursesService } from "../src/modules/courses/index.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let admin: Person;
let manager: Person;
let svc: CoursesService;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
  svc = h.t.app.get(CoursesService);
  admin = await person(h, "admin");
  manager = await person(h, "manager");
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

type M = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const call = (p: Person | undefined, method: M, url: string, body?: unknown) =>
  h.call(method, url, {
    ...(p ? { token: p.accessToken } : {}),
    ...(body !== undefined ? { body } : {}),
  });
const mkCourse = async (publish = false) => {
  const c = await svc.create(
    admin.id,
    {
      title: "Modules course",
      description: "A complete description",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    } as never,
    "rq",
  );
  return publish ? svc.publish(admin.id, c.id, "rp") : c;
};
const base = (c: string) => `/staff/courses/${c}`;
const addModule = async (c: string, title: string, who = manager) =>
  (await call(who, "POST", `${base(c)}/modules`, { title })).json() as StaffLessonList;
const addLesson = async (c: string, title: string, moduleId: string | null = null) => {
  const res = await call(manager, "POST", `${base(c)}/lessons`, {
    title,
    body: "Text",
    isPreview: false,
    idempotencyKey: randomUUID(),
    ...(moduleId ? { moduleId } : {}),
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
};
const list = async (c: string) =>
  (await call(manager, "GET", `${base(c)}/lessons`)).json() as StaffLessonList;
/** Reading order as "module title/lesson title", checking positions are exactly 1..n. */
const order = async (c: string) => {
  const l = await list(c);
  expect(l.items.map((i) => i.position)).toEqual(l.items.map((_, i) => i + 1));
  expect(l.modules.map((m) => m.position)).toEqual(l.modules.map((_, i) => i + 1));
  const names = new Map(l.modules.map((m) => [m.id, m.title]));
  return l.items.map((i) => `${i.moduleId ? names.get(i.moduleId) : "-"}/${i.title}`);
};
const moveTo = (c: string, lessonId: string, moduleId: string | null) =>
  call(manager, "PUT", `${base(c)}/lessons/${lessonId}/module`, { moduleId });

describe("modules", () => {
  it("are added in order and group the reading order, lessons without a module first", async () => {
    const c = await mkCourse();
    const a = (await addModule(c.id, "Basics")).modules[0]!;
    const b = (await addModule(c.id, "Advanced")).modules[1]!;
    await addLesson(c.id, "L1", b.id);
    await addLesson(c.id, "L2", a.id);
    await addLesson(c.id, "Intro");
    await addLesson(c.id, "L3", a.id);
    expect(await order(c.id)).toEqual(["-/Intro", "Basics/L2", "Basics/L3", "Advanced/L1"]);
    const audit = await auditRows(h, { action: "module.create" });
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it("move a lesson to the end of another module and out again", async () => {
    const c = await mkCourse();
    const a = (await addModule(c.id, "A")).modules[0]!;
    const b = (await addModule(c.id, "B")).modules[1]!;
    const x = await addLesson(c.id, "x", a.id);
    await addLesson(c.id, "y", a.id);
    await addLesson(c.id, "z", b.id);
    expect((await moveTo(c.id, x.id, b.id)).statusCode).toBe(200);
    expect(await order(c.id)).toEqual(["A/y", "B/z", "B/x"]);
    await moveTo(c.id, x.id, null);
    expect(await order(c.id)).toEqual(["-/x", "A/y", "B/z"]);
    await moveTo(c.id, x.id, null); // no change, no second audit
    expect(await auditRows(h, { action: "lesson.move", targetId: x.id })).toHaveLength(2);
  });

  it("reorder: lessons follow their modules; a stale list answers 409", async () => {
    const c = await mkCourse();
    const a = (await addModule(c.id, "A")).modules[0]!;
    const b = (await addModule(c.id, "B")).modules[1]!;
    await addLesson(c.id, "a1", a.id);
    await addLesson(c.id, "b1", b.id);
    const res = await call(manager, "PUT", `${base(c.id)}/modules/order`, {
      moduleIds: [b.id, a.id],
    });
    expect(res.statusCode).toBe(200);
    expect(await order(c.id)).toEqual(["B/b1", "A/a1"]);
    for (const moduleIds of [[a.id], [a.id, a.id], [a.id, b.id, randomUUID()]]) {
      expect(
        (await call(manager, "PUT", `${base(c.id)}/modules/order`, { moduleIds })).statusCode,
      ).toBe(409);
    }
  });

  it("keep lessons grouped when lessons are reordered", async () => {
    const c = await mkCourse();
    const a = (await addModule(c.id, "A")).modules[0]!;
    const b = (await addModule(c.id, "B")).modules[1]!;
    const a1 = await addLesson(c.id, "a1", a.id);
    const a2 = await addLesson(c.id, "a2", a.id);
    const b1 = await addLesson(c.id, "b1", b.id);
    // Ask for an order that interleaves modules; inside each module the new order is kept.
    const res = await call(manager, "PUT", `${base(c.id)}/lessons/order`, {
      lessonIds: [b1.id, a2.id, a1.id],
    });
    expect(res.statusCode).toBe(200);
    expect(await order(c.id)).toEqual(["A/a2", "A/a1", "B/b1"]);
  });

  it("delete: lessons stay without a module and positions stay compact; repeating succeeds", async () => {
    const c = await mkCourse();
    const a = (await addModule(c.id, "A")).modules[0]!;
    const b = (await addModule(c.id, "B")).modules[1]!;
    await addModule(c.id, "C");
    await addLesson(c.id, "b1", b.id);
    await addLesson(c.id, "a1", a.id);
    expect((await call(manager, "DELETE", `${base(c.id)}/modules/${b.id}`)).statusCode).toBe(200);
    expect(await order(c.id)).toEqual(["-/b1", "A/a1"]);
    expect((await list(c.id)).modules.map((m) => m.title)).toEqual(["A", "C"]);
    expect((await call(manager, "DELETE", `${base(c.id)}/modules/${b.id}`)).statusCode).toBe(200);
    expect(await h.db.lesson.count({ where: { courseId: c.id } })).toBe(2);
    expect(await auditRows(h, { action: "module.delete", targetId: b.id })).toHaveLength(1);
  });

  it("rename needs the current version", async () => {
    const c = await mkCourse();
    const a = (await addModule(c.id, "A")).modules[0]!;
    const ok = await call(manager, "PATCH", `${base(c.id)}/modules/${a.id}`, {
      expectedVersion: 1,
      title: " Renamed ",
    });
    expect((ok.json() as StaffLessonList).modules[0]).toMatchObject({
      title: "Renamed",
      version: 2,
    });
    expect(
      (
        await call(manager, "PATCH", `${base(c.id)}/modules/${a.id}`, {
          expectedVersion: 1,
          title: "X",
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call(manager, "PATCH", `${base(c.id)}/modules/${randomUUID()}`, {
          expectedVersion: 1,
          title: "X",
        })
      ).statusCode,
    ).toBe(404);
  });

  it("refuse modules of another course, bad input and the 51st module", async () => {
    const c = await mkCourse();
    const other = await mkCourse();
    const foreign = (await addModule(other.id, "Theirs")).modules[0]!;
    const lesson = await addLesson(c.id, "mine");
    const bad = await moveTo(c.id, lesson.id, foreign.id);
    expect(bad.statusCode).toBe(400);
    expect((bad.json() as { fields: { field: string }[] }).fields[0]!.field).toBe("moduleId");
    const badCreate = await call(manager, "POST", `${base(c.id)}/lessons`, {
      title: "t",
      idempotencyKey: randomUUID(),
      moduleId: foreign.id,
    });
    expect(badCreate.statusCode).toBe(400);
    expect((await moveTo(c.id, randomUUID(), null)).statusCode).toBe(404);
    for (const body of [{}, { title: "" }, { title: "x".repeat(121) }, { title: "ok", extra: 1 }]) {
      expect((await call(manager, "POST", `${base(c.id)}/modules`, body)).statusCode).toBe(400);
    }
    await h.db.courseModule.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        courseId: c.id,
        title: `M${i}`,
        position: i + 1,
      })),
    });
    expect(
      (await call(manager, "POST", `${base(c.id)}/modules`, { title: "One too many" })).statusCode,
    ).toBe(409);
  });

  it("respect per-course Instructor grants and refuse Students", async () => {
    const c = await mkCourse();
    const other = await mkCourse();
    const teacher = await person(h, "instructor");
    await h.db.instructorGrant.create({
      data: {
        userId: teacher.id,
        permission: "lesson:upload",
        courseId: c.id,
        reason: "Test grant",
      },
    });
    expect(
      (await call(teacher, "POST", `${base(c.id)}/modules`, { title: "Mine" })).statusCode,
    ).toBe(200);
    expect(
      (await call(teacher, "POST", `${base(other.id)}/modules`, { title: "Not mine" })).statusCode,
    ).toBe(403);
    const student = await person(h);
    expect((await call(student, "POST", `${base(c.id)}/modules`, { title: "No" })).statusCode).toBe(
      403,
    );
    expect(
      (await call(undefined, "POST", `${base(c.id)}/modules`, { title: "No" })).statusCode,
    ).toBe(401);
  });

  it("stay consistent under simultaneous changes", async () => {
    const c = await mkCourse();
    const created = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        call(manager, "POST", `${base(c.id)}/modules`, { title: `M${i}` }),
      ),
    );
    expect(created.every((r) => r.statusCode === 200)).toBe(true);
    const mods = (await list(c.id)).modules;
    expect(mods.map((m) => m.position)).toEqual([1, 2, 3, 4, 5, 6]);
    const lessons = [];
    for (let i = 0; i < 6; i++) lessons.push(await addLesson(c.id, `l${i}`, mods[i % 6]!.id));
    await Promise.all([
      moveTo(c.id, lessons[0]!.id, mods[5]!.id),
      call(manager, "PUT", `${base(c.id)}/modules/order`, {
        moduleIds: [...mods].reverse().map((m) => m.id),
      }),
      moveTo(c.id, lessons[3]!.id, null),
      call(manager, "DELETE", `${base(c.id)}/modules/${mods[2]!.id}`),
    ]);
    await order(c.id); // positions still 1..n for lessons and modules
  });
});

describe("students see modules in the outline and Continue follows the reading order", () => {
  it("outline lists modules and each lesson's module; next lesson follows the grouped order", async () => {
    const c = await mkCourse();
    const a = (await addModule(c.id, "Part one")).modules[0]!;
    const late = await addLesson(c.id, "Late", a.id);
    const intro = await addLesson(c.id, "Intro");
    await svc.publish(admin.id, c.id, "rp");
    const outline = (
      await call(undefined, "GET", `/courses/${c.id}/lessons`)
    ).json() as LessonOutline;
    expect(outline.modules).toEqual([{ id: a.id, title: "Part one", position: 1 }]);
    expect(outline.items.map((i) => [i.title, i.moduleId])).toEqual([
      ["Intro", null],
      ["Late", a.id],
    ]);
    const owner = await person(h);
    await h.db.entitlement.create({
      data: { userId: owner.id, courseId: c.id, source: "admin_grant", grantReason: "Test grant" },
    });
    const detail = (await call(owner, "GET", `/courses/${c.id}`)).json() as PublicCourseDetail;
    expect(detail.nextLessonId).toBe(intro.id);
    await call(owner, "PUT", `/me/courses/${c.id}/lessons/${intro.id}/completion`);
    const after = (await call(owner, "GET", `/courses/${c.id}`)).json() as PublicCourseDetail;
    expect(after.nextLessonId).toBe(late.id);
  });
});
