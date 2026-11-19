import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  LiveJoin,
  LiveSessionList,
  StaffLiveSession,
  StaffLiveSessionList,
} from "@chartnexa/api-contracts";
import { CoursesService } from "../src/modules/courses/index.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let admin: Person;
let manager: Person;
let courses: CoursesService;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
  courses = h.t.app.get(CoursesService);
  admin = await person(h, "admin");
  manager = await person(h, "manager");
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

const MIN = 60_000;
const at = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * MIN).toISOString();
const LINK = "https://meet.example.com/room-1";

type M = "GET" | "POST" | "PATCH";
const call = (p: Person | undefined, method: M, url: string, body?: unknown) =>
  h.call(method, url, {
    ...(p ? { token: p.accessToken } : {}),
    ...(body !== undefined ? { body } : {}),
  });
const mkCourse = async () => {
  const c = await courses.create(
    admin.id,
    {
      title: "Live course",
      description: "A complete description",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    } as never,
    "rq",
  );
  return courses.publish(admin.id, c.id, "rp");
};
const owner = async (courseId: string) => {
  const p = await person(h);
  await h.db.entitlement.create({
    data: { userId: p.id, courseId, source: "admin_grant", grantReason: "Test grant" },
  });
  return p;
};
const schedule = async (
  courseId: string,
  over: Record<string, unknown> = {},
  who: Person = manager,
) => {
  const res = await call(who, "POST", `/staff/courses/${courseId}/live-sessions`, {
    title: "Market open walkthrough",
    startsAt: at(120),
    durationMinutes: 60,
    joinUrl: LINK,
    ...over,
  });
  return { res, body: res.json() as StaffLiveSession };
};
/** Moves a class in time directly, as if the clock had moved on. */
const shift = (id: string, minutesFromNow: number) =>
  h.db.liveSession.update({ where: { id }, data: { startsAt: new Date(at(minutesFromNow)) } });
const join = (p: Person, c: string, id: string) =>
  call(p, "POST", `/me/courses/${c}/live-sessions/${id}/join`);

describe("scheduling", () => {
  it("schedules a class, shows it to owners without the link, and records an audit event", async () => {
    const c = await mkCourse();
    const startsAt = at(120);
    const { res, body } = await schedule(c.id, {
      startsAt,
      description: "Bring a chart",
      title: "  Opening bell  ",
    });
    expect(res.statusCode).toBe(201);
    expect(body).toMatchObject({
      title: "Opening bell",
      description: "Bring a chart",
      startsAt,
      durationMinutes: 60,
      endsAt: new Date(Date.parse(startsAt) + 60 * MIN).toISOString(),
      joinOpensAt: new Date(Date.parse(startsAt) - 15 * MIN).toISOString(),
      state: "upcoming",
      joinUrl: LINK,
      provider: "manual",
      version: 1,
      joinedCount: 0,
      cancelReason: null,
    });
    const student = await owner(c.id);
    const list = (
      await call(student, "GET", `/courses/${c.id}/live-sessions`)
    ).json() as LiveSessionList;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      id: body.id,
      courseTitle: "Live course",
      state: "upcoming",
    });
    expect(JSON.stringify(list)).not.toContain("meet.example.com");
    const audit = await auditRows(h, { action: "live.create", targetId: body.id });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorUserId).toBe(manager.id);
    expect(JSON.stringify(audit)).not.toContain("meet.example.com");
  });

  it("accepts a time with any offset and stores the same instant", async () => {
    const c = await mkCourse();
    const local = new Date(Date.now() + 3 * 60 * MIN);
    local.setUTCSeconds(0, 0);
    const shifted = new Date(local.getTime() + 330 * MIN).toISOString().replace("Z", "+05:30");
    const { body } = await schedule(c.id, { startsAt: shifted });
    expect(body.startsAt).toBe(local.toISOString());
  });

  it("refuses bad input with field messages", async () => {
    const c = await mkCourse();
    const cases: [Record<string, unknown>, string][] = [
      [{ startsAt: at(-1) }, "startsAt"],
      [{ startsAt: at(367 * 24 * 60) }, "startsAt"],
      [{ startsAt: "2030-01-01T10:00:00" }, "startsAt"],
      [{ durationMinutes: 10 }, "durationMinutes"],
      [{ durationMinutes: 481 }, "durationMinutes"],
      [{ durationMinutes: 30.5 }, "durationMinutes"],
      [{ title: "ab" }, "title"],
      [{ title: "x".repeat(121) }, "title"],
      [{ description: "x".repeat(2001) }, "description"],
      [{ joinUrl: "http://meet.example.com/a" }, "joinUrl"],
      [{ joinUrl: "javascript:alert(1)" }, "joinUrl"],
      [{ joinUrl: "https:x" }, "joinUrl"],
      // A link with a user name and password in it (built here so secret scanners stay quiet).
      [{ joinUrl: `https://${["someone", "pw"].join(":")}@meet.example.com/a` }, "joinUrl"],
      [{ joinUrl: "https://127.0.0.1/a" }, "joinUrl"],
      [{ extra: 1 }, ""],
    ];
    for (const [over, field] of cases) {
      const { res } = await schedule(c.id, over);
      expect(res.statusCode, JSON.stringify(over)).toBe(400);
      if (field) expect(JSON.stringify(res.json()), JSON.stringify(over)).toContain(field);
    }
    expect(await h.db.liveSession.count({ where: { courseId: c.id } })).toBe(0);
  });

  it("answers 404 for a course that does not exist", async () => {
    const { res } = await schedule("00000000-0000-4000-8000-000000000000", {}, admin);
    expect(res.statusCode).toBe(404);
  });

  it("limits upcoming classes per course, counting exactly when requests arrive together", async () => {
    const c = await mkCourse();
    await h.db.liveSession.createMany({
      data: Array.from({ length: 98 }, (_, i) => ({
        courseId: c.id,
        title: `Class ${i}`,
        startsAt: new Date(at(60 + i)),
        durationMinutes: 30,
        provider: "manual",
        joinUrl: LINK,
      })),
    });
    // An ended class and a cancelled one do not count.
    await h.db.liveSession.createMany({
      data: [
        {
          courseId: c.id,
          title: "Old",
          startsAt: new Date(at(-120)),
          durationMinutes: 30,
          provider: "manual",
          joinUrl: LINK,
        },
        {
          courseId: c.id,
          title: "Off",
          startsAt: new Date(at(60)),
          durationMinutes: 30,
          provider: "manual",
          joinUrl: LINK,
          status: "cancelled",
          cancelReason: "Ill",
          cancelledAt: new Date(),
        },
      ],
    });
    const results = await Promise.all([1, 2, 3, 4].map(() => schedule(c.id)));
    const codes = results.map((r) => r.res.statusCode).sort();
    expect(codes).toEqual([201, 201, 409, 409]);
    expect(results.find((r) => r.res.statusCode === 409)?.res.json()).toMatchObject({
      code: "LIVE_TOO_MANY",
    });
  });
});

describe("changing and cancelling", () => {
  it("reschedules with the version, refuses a stale version, and keeps the link out of the audit", async () => {
    const c = await mkCourse();
    const { body } = await schedule(c.id);
    const newStart = at(240);
    const res = await call(manager, "PATCH", `/staff/courses/${c.id}/live-sessions/${body.id}`, {
      expectedVersion: 1,
      startsAt: newStart,
      joinUrl: "https://meet.example.com/room-2",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      startsAt: newStart,
      version: 2,
      joinUrl: "https://meet.example.com/room-2",
    });
    const stale = await call(manager, "PATCH", `/staff/courses/${c.id}/live-sessions/${body.id}`, {
      expectedVersion: 1,
      title: "Another",
    });
    expect(stale.statusCode).toBe(409);
    const audit = await auditRows(h, { action: "live.update", targetId: body.id });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.after).toMatchObject({ startsAt: newStart, joinUrlChanged: true });
    expect(JSON.stringify(audit)).not.toContain("room-");
  });

  it("changes nothing and records nothing when nothing differs", async () => {
    const c = await mkCourse();
    const { body } = await schedule(c.id);
    const res = await call(manager, "PATCH", `/staff/courses/${c.id}/live-sessions/${body.id}`, {
      expectedVersion: 1,
      title: body.title,
      startsAt: body.startsAt,
    });
    expect(res.json()).toMatchObject({ version: 1 });
    expect(await auditRows(h, { action: "live.update", targetId: body.id })).toHaveLength(0);
  });

  it("refuses moving a class into the past and moving one that has started", async () => {
    const c = await mkCourse();
    const { body } = await schedule(c.id);
    const past = await call(manager, "PATCH", `/staff/courses/${c.id}/live-sessions/${body.id}`, {
      expectedVersion: 1,
      startsAt: at(-5),
    });
    expect(past.statusCode).toBe(400);
    await shift(body.id, -10);
    const moved = await call(manager, "PATCH", `/staff/courses/${c.id}/live-sessions/${body.id}`, {
      expectedVersion: 1,
      startsAt: at(30),
    });
    expect(moved.statusCode).toBe(400);
    // A started class can still get a new link or run longer, but not end in the past.
    const link = await call(manager, "PATCH", `/staff/courses/${c.id}/live-sessions/${body.id}`, {
      expectedVersion: 1,
      joinUrl: "https://meet.example.com/backup",
      durationMinutes: 90,
    });
    expect(link.statusCode).toBe(200);
    expect(link.json()).toMatchObject({ state: "live", durationMinutes: 90 });
    await shift(body.id, -30);
    const tooShort = await call(
      manager,
      "PATCH",
      `/staff/courses/${c.id}/live-sessions/${body.id}`,
      {
        expectedVersion: 2,
        durationMinutes: 15,
      },
    );
    expect(tooShort.statusCode).toBe(400);
  });

  it("refuses changing or cancelling an ended class", async () => {
    const c = await mkCourse();
    const { body } = await schedule(c.id);
    await shift(body.id, -61);
    const edit = await call(manager, "PATCH", `/staff/courses/${c.id}/live-sessions/${body.id}`, {
      expectedVersion: 1,
      title: "Later",
    });
    expect(edit.statusCode).toBe(409);
    expect(edit.json()).toMatchObject({ code: "LIVE_ENDED" });
    const cancel = await call(
      manager,
      "POST",
      `/staff/courses/${c.id}/live-sessions/${body.id}/cancel`,
      {
        expectedVersion: 1,
        reason: "Too late",
      },
    );
    expect(cancel.statusCode).toBe(409);
    expect(cancel.json()).toMatchObject({ code: "LIVE_ENDED" });
  });

  it("cancels with a reason students see; repeating it changes nothing; a cancelled class is final", async () => {
    const c = await mkCourse();
    const { body } = await schedule(c.id);
    const student = await owner(c.id);
    const url = `/staff/courses/${c.id}/live-sessions/${body.id}/cancel`;
    const stale = await call(manager, "POST", url, {
      expectedVersion: 7,
      reason: "Instructor ill",
    });
    expect(stale.statusCode).toBe(409);
    const first = await call(manager, "POST", url, {
      expectedVersion: 1,
      reason: "Instructor ill",
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      state: "cancelled",
      cancelReason: "Instructor ill",
      version: 2,
    });
    const again = await call(manager, "POST", url, {
      expectedVersion: 1,
      reason: "Something else",
    });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ cancelReason: "Instructor ill", version: 2 });
    expect(await auditRows(h, { action: "live.cancel", targetId: body.id })).toHaveLength(1);
    const list = (
      await call(student, "GET", `/courses/${c.id}/live-sessions`)
    ).json() as LiveSessionList;
    expect(list.items[0]).toMatchObject({ state: "cancelled", cancelReason: "Instructor ill" });
    const edit = await call(manager, "PATCH", `/staff/courses/${c.id}/live-sessions/${body.id}`, {
      expectedVersion: 2,
      title: "Back on",
    });
    expect(edit.json()).toMatchObject({ code: "LIVE_CANCELLED" });
    expect((await join(student, c.id, body.id)).json()).toMatchObject({ code: "LIVE_CANCELLED" });
    const short = await call(manager, "POST", url, { expectedVersion: 2, reason: "x" });
    expect(short.statusCode).toBe(400);
  });

  it("lets only one of two simultaneous edits with the same version win", async () => {
    const c = await mkCourse();
    const { body } = await schedule(c.id);
    const url = `/staff/courses/${c.id}/live-sessions/${body.id}`;
    const [a, b] = await Promise.all([
      call(manager, "PATCH", url, { expectedVersion: 1, title: "Edit A" }),
      call(admin, "PATCH", url, { expectedVersion: 1, title: "Edit B" }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect((await h.db.liveSession.findUniqueOrThrow({ where: { id: body.id } })).version).toBe(2);
  });

  it("does not reach a class through another course's address", async () => {
    const c = await mkCourse();
    const other = await mkCourse();
    const { body } = await schedule(c.id);
    const res = await call(
      manager,
      "PATCH",
      `/staff/courses/${other.id}/live-sessions/${body.id}`,
      {
        expectedVersion: 1,
        title: "Moved",
      },
    );
    expect(res.statusCode).toBe(404);
    const student = await owner(other.id);
    expect((await join(student, other.id, body.id)).statusCode).toBe(404);
  });
});

describe("joining", () => {
  it("gives the link only from 15 minutes before the start until the end, and counts each person once", async () => {
    const c = await mkCourse();
    const { body } = await schedule(c.id, { startsAt: at(20) });
    const student = await owner(c.id);
    const early = await join(student, c.id, body.id);
    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({ code: "LIVE_NOT_OPEN" });
    await shift(body.id, 10);
    const open = await join(student, c.id, body.id);
    expect(open.statusCode).toBe(200);
    expect(open.json() as LiveJoin).toMatchObject({ url: LINK });
    await shift(body.id, -30);
    expect((await join(student, c.id, body.id)).statusCode).toBe(200);
    await Promise.all([join(student, c.id, body.id), join(student, c.id, body.id)]);
    const staff = (
      await call(manager, "GET", `/staff/courses/${c.id}/live-sessions`)
    ).json() as StaffLiveSessionList;
    expect(staff.items[0]).toMatchObject({ state: "live", joinedCount: 1 });
    await shift(body.id, -60);
    const late = await join(student, c.id, body.id);
    expect(late.json()).toMatchObject({ code: "LIVE_ENDED" });
  });

  it("refuses people who do not own the course, and people signed out", async () => {
    const c = await mkCourse();
    const { body } = await schedule(c.id, { startsAt: at(5) });
    const stranger = await person(h);
    expect((await join(stranger, c.id, body.id)).statusCode).toBe(403);
    expect((await call(stranger, "GET", `/courses/${c.id}/live-sessions`)).statusCode).toBe(403);
    expect((await call(undefined, "GET", `/courses/${c.id}/live-sessions`)).statusCode).toBe(401);
    expect(
      (await call(undefined, "POST", `/me/courses/${c.id}/live-sessions/${body.id}/join`))
        .statusCode,
    ).toBe(401);
    // A revoked owner loses access too.
    const former = await owner(c.id);
    await h.db.entitlement.updateMany({
      where: { userId: former.id },
      data: { status: "revoked", revokedAt: new Date(), revokeReason: "Test revoke" },
    });
    expect((await join(former, c.id, body.id)).statusCode).toBe(403);
    const formerList = (await call(former, "GET", "/me/live-sessions")).json() as LiveSessionList;
    expect(formerList.items).toEqual([]);
    expect(await h.db.liveAttendance.count({ where: { sessionId: body.id } })).toBe(0);
  });

  it("lists upcoming classes across a person's courses, soonest first, without old ones", async () => {
    const a = await mkCourse();
    const b = await mkCourse();
    const notMine = await mkCourse();
    const student = await owner(a.id);
    await h.db.entitlement.create({
      data: {
        userId: student.id,
        courseId: b.id,
        source: "admin_grant",
        grantReason: "Test grant",
      },
    });
    const later = (await schedule(a.id, { startsAt: at(300) })).body;
    const sooner = (await schedule(b.id, { startsAt: at(60) })).body;
    const old = (await schedule(a.id, { startsAt: at(30) })).body;
    await shift(old.id, -200);
    await schedule(notMine.id, { startsAt: at(10) });
    const mine = (await call(student, "GET", "/me/live-sessions")).json() as LiveSessionList;
    expect(mine.items.map((i) => i.id)).toEqual([sooner.id, later.id]);
    // The course list still shows the recently ended class, so a missed class is explained.
    const course = (
      await call(student, "GET", `/courses/${a.id}/live-sessions`)
    ).json() as LiveSessionList;
    expect(course.items.map((i) => [i.id, i.state])).toEqual([
      [old.id, "ended"],
      [later.id, "upcoming"],
    ]);
    // A class that ended more than two weeks ago drops off.
    await shift(old.id, -15 * 24 * 60);
    const after = (
      await call(student, "GET", `/courses/${a.id}/live-sessions`)
    ).json() as LiveSessionList;
    expect(after.items.map((i) => i.id)).toEqual([later.id]);
  });
});

describe("permissions", () => {
  it("lets only holders of live:schedule for the course manage its classes", async () => {
    const c = await mkCourse();
    const other = await mkCourse();
    const teacher = await person(h, "instructor");
    await h.db.instructorGrant.create({
      data: {
        userId: teacher.id,
        permission: "live:schedule",
        courseId: c.id,
        reason: "Test grant",
      },
    });
    expect((await schedule(c.id, {}, teacher)).res.statusCode).toBe(201);
    expect((await schedule(other.id, {}, teacher)).res.statusCode).toBe(403);
    const plainTeacher = await person(h, "instructor");
    expect((await schedule(c.id, {}, plainTeacher)).res.statusCode).toBe(403);
    const student = await owner(c.id);
    expect((await schedule(c.id, {}, student)).res.statusCode).toBe(403);
    expect((await call(student, "GET", `/staff/courses/${c.id}/live-sessions`)).statusCode).toBe(
      403,
    );
    const { body } = await schedule(c.id);
    expect(
      (
        await call(student, "POST", `/staff/courses/${c.id}/live-sessions/${body.id}/cancel`, {
          expectedVersion: 1,
          reason: "Not mine",
        })
      ).statusCode,
    ).toBe(403);
    expect((await call(undefined, "GET", `/staff/courses/${c.id}/live-sessions`)).statusCode).toBe(
      401,
    );
  });

  it("removes a person's join records when their account is deleted", async () => {
    const c = await mkCourse();
    const { body } = await schedule(c.id, { startsAt: at(5) });
    const student = await owner(c.id);
    expect((await join(student, c.id, body.id)).statusCode).toBe(200);
    const res = await h.call("DELETE", "/me", {
      token: student.accessToken,
      body: { password: student.password },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(await h.db.liveAttendance.count({ where: { userId: student.id } })).toBe(0);
  });
});

describe("the database refuses bad classes on its own", () => {
  it("rejects bad durations, links, providers, statuses and cancel details", async () => {
    const c = await mkCourse();
    const row = (over: Record<string, unknown>) => ({
      courseId: c.id,
      title: "Direct",
      startsAt: new Date(at(60)),
      durationMinutes: 30,
      provider: "manual",
      joinUrl: LINK,
      ...over,
    });
    const bad: Record<string, unknown>[] = [
      { durationMinutes: 5 },
      { durationMinutes: 500 },
      { joinUrl: "http://meet.example.com" },
      { provider: "zoomish" },
      { status: "postponed" },
      { title: "ab" },
      { status: "cancelled" },
      { status: "cancelled", cancelReason: "Ill" },
      { cancelReason: "Ill", cancelledAt: new Date() },
      { status: "cancelled", cancelReason: "x", cancelledAt: new Date() },
      { version: 0 },
    ];
    for (const over of bad) {
      await expect(
        h.db.liveSession.create({ data: row(over) as never }),
        JSON.stringify(over),
      ).rejects.toThrow();
    }
    await h.db.liveSession.create({
      data: row({ status: "cancelled", cancelReason: "Ill", cancelledAt: new Date() }) as never,
    });
  });
});
