import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { StaffTip, TipOfTheDay } from "@chartnexa/api-contracts";
import { CoursesService } from "../src/modules/courses/index.js";
import { TipsService } from "../src/modules/tips/index.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let admin: Person;
let manager: Person;
let student: Person;
let tips: TipsService;
let courses: CoursesService;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
  tips = h.t.app.get(TipsService);
  courses = h.t.app.get(CoursesService);
  admin = await person(h, "admin");
  manager = await person(h, "manager");
  student = await person(h);
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});
beforeEach(async () => {
  await h.db.dailyTip.deleteMany();
});

const add = (p: Person | undefined, body: Record<string, unknown>) =>
  h.call("POST", "/staff/tips", {
    ...(p ? { token: p.accessToken } : {}),
    body,
  });
const text = (n: number) => `Tip number ${n}: protect your capital first.`;
const seed = async (n: number) => {
  const ids: string[] = [];
  for (let i = 1; i <= n; i++) {
    const res = await add(manager, { category: "risk_management", body: text(i) });
    expect(res.statusCode).toBe(200);
    ids.push((res.json() as StaffTip).id);
  }
  return ids;
};
const day = (n: number, hour = 12) => new Date(Date.UTC(2026, 0, 1 + n, hour));
const publishedCourse = async () => {
  const c = await courses.create(
    admin.id,
    {
      title: "Risk Basics",
      description: "A complete description",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    } as never,
    "rq",
  );
  return { c, published: await courses.publish(admin.id, c.id, "rp") };
};

describe("managing tips", () => {
  it("needs a sign-in and the announcements permission; students are refused", async () => {
    const body = { category: "market_basics", body: text(1) };
    expect((await add(undefined, body)).statusCode).toBe(401);
    expect((await add(student, body)).statusCode).toBe(403);
    expect((await h.call("GET", "/staff/tips", { token: student.accessToken })).statusCode).toBe(
      403,
    );
    expect((await h.call("GET", "/staff/tips")).statusCode).toBe(401);
    expect(await h.db.dailyTip.count()).toBe(0);
  });

  it("adds a tip, lists it and records who wrote it", async () => {
    const res = await add(manager, { category: "trading_psychology", body: `  ${text(1)}  ` });
    const tip = res.json() as StaffTip;
    expect(tip).toMatchObject({ category: "trading_psychology", body: text(1), status: "active" });
    const list = (await h.call("GET", "/staff/tips", { token: admin.accessToken })).json() as {
      items: StaffTip[];
    };
    expect(list.items.map((t) => t.id)).toEqual([tip.id]);
    const audit = await auditRows(h, { action: "tip.create", targetId: tip.id });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorUserId).toBe(manager.id);
  });

  it("refuses bad input", async () => {
    for (const body of [
      { category: "gambling", body: text(1) },
      { category: "market_basics", body: "short" },
      { category: "market_basics", body: "x".repeat(241) },
      { category: "market_basics", body: text(1), extra: 1 },
      { category: "market_basics", body: text(1), courseId: "not-a-uuid" },
    ]) {
      expect((await add(manager, body)).statusCode).toBe(400);
    }
    expect(await h.db.dailyTip.count()).toBe(0);
  });

  it("links only to a published course", async () => {
    const draft = await courses.create(
      admin.id,
      {
        title: "Draft course",
        description: "A complete description",
        level: "beginner",
        priceCents: 0,
        coverTone: "blue",
      } as never,
      "rq2",
    );
    const body = { category: "market_basics", body: text(1) };
    expect((await add(manager, { ...body, courseId: draft.id })).statusCode).toBe(404);
    expect((await add(manager, { ...body, courseId: randomUUID() })).statusCode).toBe(404);
    const { c } = await publishedCourse();
    const ok = await add(manager, { ...body, courseId: c.id });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as StaffTip).courseTitle).toBe("Risk Basics");
  });

  it("archives once; archiving again changes nothing and writes no second record", async () => {
    const [id] = await seed(1);
    const url = `/staff/tips/${id}/archive`;
    const first = await h.call("POST", url, { token: manager.accessToken });
    expect((first.json() as StaffTip).status).toBe("archived");
    const again = await h.call("POST", url, { token: manager.accessToken });
    expect(again.statusCode).toBe(200);
    expect(await auditRows(h, { action: "tip.archive", targetId: id })).toHaveLength(1);
    expect(
      (await h.call("POST", `/staff/tips/${randomUUID()}/archive`, { token: manager.accessToken }))
        .statusCode,
    ).toBe(404);
    expect((await h.call("POST", url, { token: student.accessToken })).statusCode).toBe(403);
  });
});

describe("tip of the day", () => {
  it("needs a sign-in, and says null until staff write a tip", async () => {
    expect((await h.call("GET", "/me/tip-of-the-day")).statusCode).toBe(401);
    const res = await h.call("GET", "/me/tip-of-the-day", { token: student.accessToken });
    expect(res.statusCode).toBe(200);
    expect((res.json() as TipOfTheDay).tip).toBeNull();
  });

  it("is the same tip for everyone all day, and the same on every call", async () => {
    await seed(3);
    const morning = await tips.ofTheDay(day(5, 0));
    const night = await tips.ofTheDay(day(5, 23));
    expect(morning.tip?.id).toBeDefined();
    expect(night.tip?.id).toBe(morning.tip?.id);
    expect(morning.date).toBe("2026-01-06");
    const a = (await h.call("GET", "/me/tip-of-the-day", { token: student.accessToken })).json();
    const b = (await h.call("GET", "/me/tip-of-the-day", { token: admin.accessToken })).json();
    expect(a).toEqual(b);
  });

  it("shows every tip once before any repeats, then starts the cycle again", async () => {
    const ids = await seed(3);
    const seen = [];
    for (let d = 10; d < 16; d++) seen.push((await tips.ofTheDay(day(d))).tip?.id);
    expect(new Set(seen.slice(0, 3))).toEqual(new Set(ids));
    expect(seen.slice(3)).toEqual(seen.slice(0, 3));
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it("leaves archived tips out of the rotation", async () => {
    const ids = await seed(3);
    await h.call("POST", `/staff/tips/${ids[1]}/archive`, { token: manager.accessToken });
    const seen = new Set<string | undefined>();
    for (let d = 0; d < 6; d++) seen.add((await tips.ofTheDay(day(d))).tip?.id);
    expect(seen).toEqual(new Set([ids[0], ids[2]]));
  });

  it("offers Learn more only while the linked course is published", async () => {
    const { c } = await publishedCourse();
    await add(manager, { category: "market_basics", body: text(1), courseId: c.id });
    const linked = await tips.ofTheDay(day(0));
    expect(linked.tip).toMatchObject({ courseId: c.id, courseTitle: "Risk Basics" });
    await h.db.course.update({ where: { id: c.id }, data: { status: "draft" } });
    const after = await tips.ofTheDay(day(0));
    expect(after.tip).toMatchObject({ courseId: null, courseTitle: null });
  });
});
