import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

const mkCourse = () =>
  h.db.course.create({ data: { title: "Completion course", level: "beginner", priceCents: 0 } });
const mkLesson = (courseId: string, position = 1) =>
  h.db.lesson.create({ data: { courseId, title: `Lesson ${position}`, position } });

describe("the database keeps completions honest on its own", () => {
  it("allows one completion per person and lesson, and different people for one lesson", async () => {
    const a = await person(h);
    const b = await person(h);
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    await h.db.lessonCompletion.create({ data: { userId: a.id, lessonId: l.id, courseId: c.id } });
    await expect(
      h.db.lessonCompletion.create({ data: { userId: a.id, lessonId: l.id, courseId: c.id } }),
    ).rejects.toThrow();
    await h.db.lessonCompletion.create({ data: { userId: b.id, lessonId: l.id, courseId: c.id } });
    expect(await h.db.lessonCompletion.count({ where: { lessonId: l.id } })).toBe(2);
  });

  it("refuses a completion whose course is not the lesson's course", async () => {
    const a = await person(h);
    const c1 = await mkCourse();
    const c2 = await mkCourse();
    const l = await mkLesson(c1.id);
    await expect(
      h.db.lessonCompletion.create({ data: { userId: a.id, lessonId: l.id, courseId: c2.id } }),
    ).rejects.toThrow();
    expect(await h.db.lessonCompletion.count({ where: { userId: a.id } })).toBe(0);
  });

  it("refuses an orphan completion for a missing person or lesson", async () => {
    const a = await person(h);
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    const nobody = "00000000-0000-4000-8000-000000000000";
    await expect(
      h.db.lessonCompletion.create({ data: { userId: nobody, lessonId: l.id, courseId: c.id } }),
    ).rejects.toThrow();
    await expect(
      h.db.lessonCompletion.create({ data: { userId: a.id, lessonId: nobody, courseId: c.id } }),
    ).rejects.toThrow();
  });

  it("removes completions together with their lesson, leaving other lessons' alone", async () => {
    const a = await person(h);
    const c = await mkCourse();
    const l1 = await mkLesson(c.id, 1);
    const l2 = await mkLesson(c.id, 2);
    for (const l of [l1, l2]) {
      await h.db.lessonCompletion.create({
        data: { userId: a.id, lessonId: l.id, courseId: c.id },
      });
    }
    await h.db.lesson.delete({ where: { id: l1.id } });
    const left = await h.db.lessonCompletion.findMany({ where: { userId: a.id } });
    expect(left.map((r) => r.lessonId)).toEqual([l2.id]);
  });
});
