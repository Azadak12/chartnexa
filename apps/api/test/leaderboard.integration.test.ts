import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Leaderboard } from "@chartnexa/api-contracts";
import { periodStart } from "../src/modules/leaderboard/index.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let admin: Person;
const lessons: { courseId: string; ids: string[] }[] = [];

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
  admin = await person(h, "admin");
  // Two published courses with five lessons each, written directly: the completion rules have
  // their own tests; this file tests what the ranking does with completion rows.
  for (const title of ["Course A", "Course B"]) {
    const c = await h.db.course.create({
      data: {
        title,
        description: "A complete description",
        level: "beginner",
        priceCents: 0,
        coverTone: "blue",
        status: "published",
        publishedAt: new Date(),
        createdBy: admin.id,
      } as never,
    });
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const l = await h.db.lesson.create({
        data: { courseId: c.id, title: `L${i}`, position: i },
      });
      ids.push(l.id);
    }
    lessons.push({ courseId: c.id, ids });
  }
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});
beforeEach(async () => {
  await h.db.lessonCompletion.deleteMany();
  await h.db.user.updateMany({ data: { leaderboardOptIn: false } });
});

const learner = async (name: string | null, optIn = true) => {
  const p = await person(h);
  await h.db.user.update({
    where: { id: p.id },
    data: { displayName: name, leaderboardOptIn: optIn },
  });
  return p;
};
const finish = (p: Person, n: number, opts: { course?: number; at?: Date; from?: number } = {}) => {
  const c = lessons[opts.course ?? 0]!;
  return Promise.all(
    c.ids.slice(opts.from ?? 0, (opts.from ?? 0) + n).map((lessonId) =>
      h.db.lessonCompletion.create({
        data: {
          userId: p.id,
          courseId: c.courseId,
          lessonId,
          ...(opts.at ? { completedAt: opts.at } : {}),
        },
      }),
    ),
  );
};
const board = async (p: Person, qs = "") => {
  const res = await h.call("GET", `/leaderboard${qs}`, { token: p.accessToken });
  expect(res.statusCode).toBe(200);
  return res.json() as Leaderboard;
};
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe("who appears", () => {
  it("needs a sign-in", async () => {
    expect((await h.call("GET", "/leaderboard")).statusCode).toBe(401);
    expect((await h.call("GET", "/me/leaderboard-settings")).statusCode).toBe(401);
  });

  it("lists only learners who opted in, are active and have a display name", async () => {
    const ann = await learner("Ann");
    const hidden = await learner("Hidden", false);
    const nameless = await learner(null);
    const gone = await learner("Gone");
    await h.db.user.update({ where: { id: gone.id }, data: { status: "disabled" } as never });
    for (const p of [ann, hidden, nameless, gone]) await finish(p, 2);
    const b = await board(ann, "?period=all");
    expect(b.entries.map((e) => e.displayName)).toEqual(["Ann"]);
  });

  it("never sends ids or emails", async () => {
    const ann = await learner("Ann");
    await finish(ann, 1);
    const raw = (await h.call("GET", "/leaderboard?period=all", { token: ann.accessToken })).body;
    expect(raw).not.toContain(ann.id);
    expect(raw).not.toContain(ann.email);
    expect(Object.keys(JSON.parse(raw).entries[0]).sort()).toEqual([
      "completedLessons",
      "displayName",
      "isMe",
      "rank",
    ]);
  });
});

describe("joining and leaving", () => {
  it("is off by default, needs a display name, and writes an audit record", async () => {
    const p = await learner(null, false);
    const get = async () =>
      (await h.call("GET", "/me/leaderboard-settings", { token: p.accessToken })).json();
    expect(await get()).toEqual({ optedIn: false });
    const put = (optedIn: unknown) =>
      h.call("PUT", "/me/leaderboard-settings", { token: p.accessToken, body: { optedIn } });
    expect((await put(true)).statusCode).toBe(409);
    expect((await put("yes")).statusCode).toBe(400);
    await h.db.user.update({ where: { id: p.id }, data: { displayName: "Pat" } });
    expect((await put(true)).statusCode).toBe(200);
    expect(await get()).toEqual({ optedIn: true });
    await put(true);
    expect(await auditRows(h, { action: "leaderboard.join", targetId: p.id })).toHaveLength(1);
    await put(false);
    expect(await get()).toEqual({ optedIn: false });
    expect(await auditRows(h, { action: "leaderboard.leave", targetId: p.id })).toHaveLength(1);
  });

  it("leaving removes you from the list straight away", async () => {
    const ann = await learner("Ann");
    const bo = await learner("Bo");
    await finish(ann, 3);
    await finish(bo, 2);
    await h.call("PUT", "/me/leaderboard-settings", {
      token: ann.accessToken,
      body: { optedIn: false },
    });
    const b = await board(bo, "?period=all");
    expect(b.entries.map((e) => e.displayName)).toEqual(["Bo"]);
    expect(b.entries[0]?.rank).toBe(1);
  });
});

describe("ranking", () => {
  it("ranks by completed lessons, ties share a rank, the next rank skips", async () => {
    const [a, b, c, d] = [
      await learner("Ann"),
      await learner("Bo"),
      await learner("Cy"),
      await learner("Di"),
    ] as [Person, Person, Person, Person];
    await finish(a, 4);
    await finish(b, 2);
    await finish(c, 2);
    await finish(d, 1);
    const out = await board(d, "?period=all");
    expect(out.entries.map((e) => [e.rank, e.completedLessons])).toEqual([
      [1, 4],
      [2, 2],
      [2, 2],
      [4, 1],
    ]);
    expect(out.entries.filter((e) => e.isMe).map((e) => e.displayName)).toEqual(["Di"]);
    expect(out.me).toEqual({ optedIn: true, rank: 4, completedLessons: 1 });
  });

  it("counts the same lesson once even though completing it can be repeated", async () => {
    const a = await learner("Ann");
    await finish(a, 1);
    await expect(finish(a, 1)).rejects.toThrow();
    expect((await board(a, "?period=all")).entries[0]?.completedLessons).toBe(1);
  });

  it("filters by week, month and all time using completion dates", async () => {
    const a = await learner("Ann");
    const b = await learner("Bo");
    await finish(a, 1, { at: new Date() });
    await finish(b, 3, { at: daysAgo(400) });
    expect((await board(a, "?period=weekly")).entries.map((e) => e.displayName)).toEqual(["Ann"]);
    expect((await board(a, "?period=monthly")).entries.map((e) => e.displayName)).toEqual(["Ann"]);
    expect((await board(a, "?period=all")).entries.map((e) => e.displayName)).toEqual([
      "Bo",
      "Ann",
    ]);
    expect((await board(a)).period).toBe("weekly");
  });

  it("starts a week on Monday and a month on the 1st, in UTC", () => {
    const wed = new Date(Date.UTC(2026, 10, 18, 15));
    expect(periodStart("weekly", wed)?.toISOString()).toBe("2026-11-16T00:00:00.000Z");
    const sun = new Date(Date.UTC(2026, 10, 22, 23, 59));
    expect(periodStart("weekly", sun)?.toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(periodStart("monthly", wed)?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(periodStart("all", wed)).toBeNull();
  });

  it("filters by course, and refuses an unknown or unpublished course", async () => {
    const a = await learner("Ann");
    const b = await learner("Bo");
    await finish(a, 3, { course: 0 });
    await finish(b, 2, { course: 1 });
    const one = await board(a, `?period=all&courseId=${lessons[1]!.courseId}`);
    expect(one.entries.map((e) => e.displayName)).toEqual(["Bo"]);
    expect(one.me.rank).toBeNull();
    const none = await h.call("GET", "/leaderboard?courseId=00000000-0000-4000-8000-000000000000", {
      token: a.accessToken,
    });
    expect(none.statusCode).toBe(404);
    await h.db.course.update({ where: { id: lessons[1]!.courseId }, data: { status: "draft" } });
    const draft = await h.call("GET", `/leaderboard?courseId=${lessons[1]!.courseId}`, {
      token: a.accessToken,
    });
    expect(draft.statusCode).toBe(404);
    await h.db.course.update({
      where: { id: lessons[1]!.courseId },
      data: { status: "published" },
    });
    expect(
      (await h.call("GET", "/leaderboard?courseId=nope", { token: a.accessToken })).statusCode,
    ).toBe(400);
    expect(
      (await h.call("GET", "/leaderboard?period=daily", { token: a.accessToken })).statusCode,
    ).toBe(400);
  });

  it("shows your own standing even when you are outside the listed entries", async () => {
    const people: Person[] = [];
    for (let i = 0; i < 52; i++) people.push(await learner(`Learner ${i}`));
    for (const p of people.slice(0, 51)) await finish(p, 2);
    const last = people[51]!;
    await finish(last, 1);
    const out = await board(last, "?period=all");
    expect(out.entries).toHaveLength(50);
    expect(out.entries.some((e) => e.isMe)).toBe(false);
    expect(out.me).toEqual({ optedIn: true, rank: 52, completedLessons: 1 });
  }, 120_000);

  it("gives a signed-in learner who has not joined no rank", async () => {
    const outsider = await learner("Out", false);
    await finish(outsider, 2);
    const out = await board(outsider, "?period=all");
    expect(out.me).toEqual({ optedIn: false, rank: null, completedLessons: null });
    expect(out.entries).toEqual([]);
  });
});
