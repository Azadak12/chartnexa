import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ContinueLearning } from "@chartnexa/api-contracts";
import { CoursesService } from "../src/modules/courses/index.js";
import { person, type Person } from "./access-helpers.js";
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

const mkCourse = async (title: string, lessons: number) => {
  const c = await courses.create(
    admin.id,
    {
      title,
      description: "A complete description",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    } as never,
    "rq",
  );
  await courses.publish(admin.id, c.id, "rp");
  const ids: string[] = [];
  for (let i = 1; i <= lessons; i++) {
    const res = await h.call("POST", `/staff/courses/${c.id}/lessons`, {
      token: manager.accessToken,
      body: { title: `Lesson ${i}`, idempotencyKey: randomUUID() },
    });
    ids.push((res.json() as { id: string }).id);
  }
  return { id: c.id, lessons: ids };
};
const own = (userId: string, courseId: string, at = new Date()) =>
  h.db.entitlement.create({
    data: { userId, courseId, source: "admin_grant", grantReason: "Test grant", createdAt: at },
  });
const complete = (userId: string, courseId: string, lessonId: string, at: Date) =>
  h.db.lessonCompletion.create({ data: { userId, courseId, lessonId, completedAt: at } });
const get = async (p: Person) => {
  const res = await h.call("GET", "/me/continue-learning", { token: p.accessToken });
  expect(res.statusCode).toBe(200);
  return (res.json() as ContinueLearning).item;
};
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

describe("continue learning", () => {
  it("is empty for someone who owns nothing, and needs a sign-in", async () => {
    expect(await get(await person(h))).toBeNull();
    expect((await h.call("GET", "/me/continue-learning")).statusCode).toBe(401);
  });

  it("picks the course with the latest activity and names its next lesson", async () => {
    const p = await person(h);
    const a = await mkCourse("Course A", 3);
    const b = await mkCourse("Course B", 2);
    await own(p.id, a.id, ago(600));
    await own(p.id, b.id, ago(500));
    const latest = ago(10);
    await complete(p.id, a.id, a.lessons[0] as string, latest);
    await complete(p.id, b.id, b.lessons[0] as string, ago(60));
    expect(await get(p)).toMatchObject({
      courseId: a.id,
      courseTitle: "Course A",
      completed: 1,
      total: 3,
      nextLessonId: a.lessons[1],
      nextLessonTitle: "Lesson 2",
      lastActivityAt: latest.toISOString(),
    });
  });

  it("counts video watching as activity", async () => {
    const p = await person(h);
    const a = await mkCourse("Read course", 2);
    const b = await mkCourse("Watch course", 2);
    await own(p.id, a.id, ago(300));
    await own(p.id, b.id, ago(300));
    await complete(p.id, a.id, a.lessons[0] as string, ago(30));
    await h.db.videoProgress.create({
      data: {
        userId: p.id,
        lessonId: b.lessons[0] as string,
        courseId: b.id,
        positionSeconds: 40,
        watchedSeconds: 40,
        updatedAt: ago(2),
      },
    });
    expect((await get(p))?.courseId).toBe(b.id);
  });

  it("skips finished and empty courses and falls back to the newest enrollment", async () => {
    const p = await person(h);
    const done = await mkCourse("Finished", 1);
    const empty = await mkCourse("Empty", 0);
    const fresh = await mkCourse("Fresh", 2);
    await own(p.id, fresh.id, ago(100));
    await own(p.id, done.id, ago(50));
    await own(p.id, empty.id, ago(1));
    await complete(p.id, done.id, done.lessons[0] as string, ago(5));
    expect(await get(p)).toMatchObject({
      courseId: fresh.id,
      completed: 0,
      nextLessonId: fresh.lessons[0],
    });
  });

  it("ignores revoked access and other people's activity", async () => {
    const p = await person(h);
    const q = await person(h);
    const a = await mkCourse("Revoked", 2);
    const b = await mkCourse("Kept", 2);
    await own(p.id, a.id, ago(10));
    await own(p.id, b.id, ago(400));
    await own(q.id, b.id, ago(400));
    await complete(q.id, b.id, b.lessons[0] as string, ago(1));
    expect((await get(p))?.courseId).toBe(a.id);
    await h.db.entitlement.updateMany({
      where: { userId: p.id, courseId: a.id },
      data: { status: "revoked", revokedAt: new Date(), revokeReason: "Test revoke" },
    });
    expect(await get(p)).toMatchObject({ courseId: b.id, completed: 0 });
  });
});
