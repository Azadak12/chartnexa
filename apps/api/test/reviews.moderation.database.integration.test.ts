import { readFileSync } from "node:fs";
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

const mk = async () => {
  const course = await h.db.course.create({
    data: { title: "Moderation DB", level: "beginner", priceCents: 0 },
  });
  const author = await person(h);
  const review = await h.db.review.create({
    data: { userId: author.id, courseId: course.id, rating: 3 },
  });
  return { course, author, review };
};
const hidden = (over: Record<string, unknown> = {}) => ({
  hiddenAt: new Date(),
  hiddenReason: "spam",
  hiddenNote: "",
  ...over,
});

describe("the database keeps moderation state honest on its own", () => {
  it("sets the hiding columns together or not at all", async () => {
    const { review } = await mk();
    await expect(
      h.db.review.update({ where: { id: review.id }, data: { hiddenAt: new Date() } }),
    ).rejects.toThrow();
    await expect(
      h.db.review.update({ where: { id: review.id }, data: { hiddenReason: "spam" } }),
    ).rejects.toThrow();
    await h.db.review.update({ where: { id: review.id }, data: hidden() });
    await expect(
      h.db.review.update({ where: { id: review.id }, data: { hiddenReason: null } }),
    ).rejects.toThrow();
  });

  it("accepts only the listed reasons and notes of 500 characters or fewer", async () => {
    const { review } = await mk();
    for (const hiddenReason of ["low_rating", "", "SPAM"]) {
      await expect(
        h.db.review.update({ where: { id: review.id }, data: hidden({ hiddenReason }) }),
      ).rejects.toThrow();
    }
    await expect(
      h.db.review.update({
        where: { id: review.id },
        data: hidden({ hiddenNote: "x".repeat(501) }),
      }),
    ).rejects.toThrow();
    await h.db.review.update({
      where: { id: review.id },
      data: hidden({ hiddenNote: "x".repeat(500) }),
    });
  });

  it("limits reports: known reason, short note, one open report per person", async () => {
    const { review } = await mk();
    const reporter = await person(h);
    const base = { reviewId: review.id, reporterId: reporter.id, reason: "spam" };
    await expect(
      h.db.reviewReport.create({ data: { ...base, reason: "low_rating" } }),
    ).rejects.toThrow();
    await expect(
      h.db.reviewReport.create({ data: { ...base, note: "x".repeat(301) } }),
    ).rejects.toThrow();
    const first = await h.db.reviewReport.create({ data: base });
    await expect(h.db.reviewReport.create({ data: base })).rejects.toThrow();
    await h.db.reviewReport.update({ where: { id: first.id }, data: { resolvedAt: new Date() } });
    await h.db.reviewReport.create({ data: base }); // allowed again once resolved
  });

  it("limits appeals: status, decided together, one per hiding, message length", async () => {
    const { review } = await mk();
    const at = new Date();
    const base = { reviewId: review.id, hiddenAt: at, message: "Please look again" };
    await expect(h.db.reviewAppeal.create({ data: { ...base, status: "won" } })).rejects.toThrow();
    await expect(h.db.reviewAppeal.create({ data: { ...base, message: "" } })).rejects.toThrow();
    await expect(
      h.db.reviewAppeal.create({ data: { ...base, message: "x".repeat(501) } }),
    ).rejects.toThrow();
    await expect(
      h.db.reviewAppeal.create({ data: { ...base, status: "upheld" } }),
    ).rejects.toThrow(); // decided but no decision time
    await expect(
      h.db.reviewAppeal.create({ data: { ...base, decidedAt: new Date() } }),
    ).rejects.toThrow(); // open but has a decision time
    await h.db.reviewAppeal.create({ data: base });
    await expect(h.db.reviewAppeal.create({ data: base })).rejects.toThrow();
    await h.db.reviewAppeal.create({ data: { ...base, hiddenAt: new Date(at.getTime() + 1000) } });
  });

  it("removes reports and appeals with their review, leaving nothing behind", async () => {
    const { review } = await mk();
    const reporter = await person(h);
    await h.db.reviewReport.create({
      data: { reviewId: review.id, reporterId: reporter.id, reason: "spam" },
    });
    await h.db.reviewAppeal.create({
      data: { reviewId: review.id, hiddenAt: new Date(), message: "Hello" },
    });
    await h.db.review.delete({ where: { id: review.id } });
    expect(await h.db.reviewReport.count({ where: { reviewId: review.id } })).toBe(0);
    expect(await h.db.reviewAppeal.count({ where: { reviewId: review.id } })).toBe(0);
  });
});

describe("the down migration", () => {
  it("counts hidden reviews in the totals again before the columns go", async () => {
    const { course, review } = await mk();
    const other = await person(h);
    await h.db.review.create({ data: { userId: other.id, courseId: course.id, rating: 5 } });
    // The totals count only the visible review (5); the hidden one (3) is not in them.
    await h.db.course.update({
      where: { id: course.id },
      data: { ratingCount: 1, ratingSum: 5 },
    });
    await h.db.review.update({ where: { id: review.id }, data: hidden() });
    const sql = readFileSync(
      new URL("../prisma/migrations/20261118070000_review_moderation/down.sql", import.meta.url),
      "utf8",
    );
    const statements = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .split(/;\s*\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    const stop = new Error("rollback on purpose");
    let seen: { rating_count: number; rating_sum: number } | undefined;
    await h.db
      .$transaction(async (tx) => {
        for (const st of statements) await tx.$executeRawUnsafe(st);
        seen = (
          await tx.$queryRaw<{ rating_count: number; rating_sum: number }[]>`
            SELECT rating_count, rating_sum FROM courses WHERE id = ${course.id}::uuid`
        )[0];
        throw stop;
      })
      .catch((e) => {
        if (e !== stop) throw e;
      });
    expect(seen).toEqual({ rating_count: 2, rating_sum: 8 });
  });
});
