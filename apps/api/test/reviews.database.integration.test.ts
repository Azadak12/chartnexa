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
  h.db.course.create({ data: { title: "Review course", level: "beginner", priceCents: 0 } });
const review = (userId: string, courseId: string, over: Record<string, unknown> = {}) => ({
  userId,
  courseId,
  rating: 4,
  ...over,
});

describe("the database keeps reviews honest on its own", () => {
  it("accepts ratings 1 to 5 and nothing else", async () => {
    const c = await mkCourse();
    for (const rating of [0, 6, -1]) {
      const p = await person(h);
      await expect(h.db.review.create({ data: review(p.id, c.id, { rating }) })).rejects.toThrow();
    }
    for (const rating of [1, 5]) {
      const p = await person(h);
      await h.db.review.create({ data: review(p.id, c.id, { rating }) });
    }
  });

  it("limits the text to 1,000 characters", async () => {
    const c = await mkCourse();
    const p = await person(h);
    const q = await person(h);
    await expect(
      h.db.review.create({ data: review(p.id, c.id, { body: "x".repeat(1001) }) }),
    ).rejects.toThrow();
    await h.db.review.create({ data: review(q.id, c.id, { body: "x".repeat(1000) }) });
  });

  it("allows one review per person and course, many people per course, many courses per person", async () => {
    const c1 = await mkCourse();
    const c2 = await mkCourse();
    const p = await person(h);
    const q = await person(h);
    await h.db.review.create({ data: review(p.id, c1.id) });
    await expect(h.db.review.create({ data: review(p.id, c1.id) })).rejects.toThrow();
    await h.db.review.create({ data: review(q.id, c1.id) });
    await h.db.review.create({ data: review(p.id, c2.id) });
  });

  it("refuses an orphan review and removes reviews with their course", async () => {
    const p = await person(h);
    const c = await mkCourse();
    const nobody = "00000000-0000-4000-8000-000000000000";
    await expect(h.db.review.create({ data: review(nobody, c.id) })).rejects.toThrow();
    await expect(h.db.review.create({ data: review(p.id, nobody) })).rejects.toThrow();
    await h.db.review.create({ data: review(p.id, c.id) });
    await h.db.course.delete({ where: { id: c.id } });
    expect(await h.db.review.count({ where: { userId: p.id } })).toBe(0);
  });

  it("refuses totals that are negative or impossible for the count", async () => {
    const c = await mkCourse();
    const bad = [
      { ratingCount: -1, ratingSum: 0 },
      { ratingCount: 2, ratingSum: 1 },
      { ratingCount: 2, ratingSum: 11 },
      { ratingCount: 0, ratingSum: 1 },
    ];
    for (const data of bad) {
      await expect(h.db.course.update({ where: { id: c.id }, data })).rejects.toThrow();
    }
    await h.db.course.update({ where: { id: c.id }, data: { ratingCount: 2, ratingSum: 10 } });
    await h.db.course.update({ where: { id: c.id }, data: { ratingCount: 2, ratingSum: 2 } });
    await h.db.course.update({ where: { id: c.id }, data: { ratingCount: 0, ratingSum: 0 } });
  });
});
