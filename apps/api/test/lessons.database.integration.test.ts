import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  h.db.course.create({ data: { title: "Lesson constraints", level: "beginner", priceCents: 0 } });
const lesson = (courseId: string, over: Record<string, unknown> = {}) => ({
  courseId,
  title: "Intro",
  position: 1,
  ...over,
});

describe("the database refuses bad lessons on its own", () => {
  it("rejects empty or long titles, long bodies, bad positions and versions", async () => {
    const c = await mkCourse();
    await expect(h.db.lesson.create({ data: lesson(c.id, { title: "" }) })).rejects.toThrow();
    await expect(
      h.db.lesson.create({ data: lesson(c.id, { title: "x".repeat(121) }) }),
    ).rejects.toThrow();
    await expect(
      h.db.lesson.create({ data: lesson(c.id, { body: "x".repeat(20_001) }) }),
    ).rejects.toThrow();
    await expect(h.db.lesson.create({ data: lesson(c.id, { position: 0 }) })).rejects.toThrow();
    await expect(h.db.lesson.create({ data: lesson(c.id, { position: 201 }) })).rejects.toThrow();
    await expect(h.db.lesson.create({ data: lesson(c.id, { version: 0 }) })).rejects.toThrow();
    // The limits themselves are allowed.
    await h.db.lesson.create({
      data: lesson(c.id, { title: "x".repeat(120), body: "y".repeat(20_000), position: 200 }),
    });
  });

  it("never commits a duplicate position, but allows a swap inside one transaction", async () => {
    const c = await mkCourse();
    const a = await h.db.lesson.create({ data: lesson(c.id, { position: 1 }) });
    const b = await h.db.lesson.create({ data: lesson(c.id, { title: "B", position: 2 }) });
    await expect(
      h.db.lesson.create({ data: lesson(c.id, { title: "C", position: 2 }) }),
    ).rejects.toThrow();
    await h.db.$transaction([
      h.db.lesson.update({ where: { id: a.id }, data: { position: 2 } }),
      h.db.lesson.update({ where: { id: b.id }, data: { position: 1 } }),
    ]);
    const rows = await h.db.lesson.findMany({
      where: { courseId: c.id },
      orderBy: { position: "asc" },
    });
    expect(rows.map((r) => r.title)).toEqual(["B", "Intro"]);
    // A transaction that ends with a duplicate fails at commit.
    await expect(
      h.db.$transaction([h.db.lesson.update({ where: { id: a.id }, data: { position: 1 } })]),
    ).rejects.toThrow();
  });

  it("allows the same position in different courses", async () => {
    const c1 = await mkCourse();
    const c2 = await mkCourse();
    await h.db.lesson.create({ data: lesson(c1.id) });
    await h.db.lesson.create({ data: lesson(c2.id) });
  });

  it("refuses an orphan lesson and removes lessons and keys with their course", async () => {
    await expect(
      h.db.lesson.create({
        data: lesson("00000000-0000-4000-8000-000000000000"),
      }),
    ).rejects.toThrow();
    const c = await mkCourse();
    const l = await h.db.lesson.create({ data: lesson(c.id) });
    await h.db.lessonCreateKey.create({
      data: { courseId: c.id, key: "retry-key-0001", lessonId: l.id },
    });
    await expect(
      h.db.lessonCreateKey.create({
        data: { courseId: c.id, key: "short", lessonId: l.id },
      }),
    ).rejects.toThrow();
    await h.db.course.delete({ where: { id: c.id } });
    expect(await h.db.lesson.count({ where: { courseId: c.id } })).toBe(0);
    expect(await h.db.lessonCreateKey.count({ where: { courseId: c.id } })).toBe(0);
  });

  it("forgets a key when its lesson is deleted", async () => {
    const c = await mkCourse();
    const l = await h.db.lesson.create({ data: lesson(c.id) });
    await h.db.lessonCreateKey.create({
      data: { courseId: c.id, key: "retry-key-0002", lessonId: l.id },
    });
    await h.db.lesson.delete({ where: { id: l.id } });
    expect(await h.db.lessonCreateKey.count({ where: { courseId: c.id } })).toBe(0);
  });
});
