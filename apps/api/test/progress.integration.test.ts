import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  errorEnvelopeSchema,
  type CompletionResponse,
  type MyCourse,
  type Page,
  type ProgressResponse,
  type PublicCourseDetail,
} from "@chartnexa/api-contracts";
import { PrismaService } from "../src/database/prisma.service.js";
import { CoursesService } from "../src/modules/courses/index.js";
import { ProgressService } from "../src/modules/progress/index.js";
import { person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let admin: Person;
let instructor: Person;
let courses: CoursesService;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
  courses = h.t.app.get(CoursesService);
  admin = await person(h, "admin");
  instructor = await person(h, "instructor");
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

let pos = 0;
const mkCourse = async (publish = true) => {
  const c = await courses.create(
    admin.id,
    {
      title: "Progress course",
      description: "A complete description",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    } as never,
    "req-course",
  );
  return publish ? courses.publish(admin.id, c.id, "req-publish") : c;
};
const mkLessons = async (courseId: string, n: number) => {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push(
      await h.db.lesson.create({
        data: { courseId, title: `Lesson ${i}`, body: `Body ${i}`, position: i },
      }),
    );
    pos++;
  }
  return out;
};
const enroll = (userId: string, courseId: string) =>
  h.db.entitlement.create({
    data: { userId, courseId, source: "admin_grant", grantReason: "Test grant" },
  });
const owner = async (courseId: string) => {
  const p = await person(h);
  await enroll(p.id, courseId);
  return p;
};
const url = (c: string, l: string) => `/me/courses/${c}/lessons/${l}/completion`;
const call = (
  p: Person | undefined,
  method: "GET" | "PUT" | "DELETE",
  path: string,
  token?: string,
) =>
  h.call(method, path, {
    ...((token ?? p?.accessToken) ? { token: (token ?? p?.accessToken) as string } : {}),
  });
const mark = (p: Person | undefined, c: string, l: string) => call(p, "PUT", url(c, l));
const unmark = (p: Person | undefined, c: string, l: string) => call(p, "DELETE", url(c, l));
const read = async (p: Person, c: string) =>
  (await call(p, "GET", `/me/courses/${c}/progress`)).json() as ProgressResponse;
const rows = (userId: string, courseId: string) =>
  h.db.lessonCompletion.count({ where: { userId, courseId } });

describe("marking lessons complete", () => {
  it("lets an owner mark a lesson and keeps the first time when repeated", async () => {
    const c = await mkCourse();
    const [l1] = await mkLessons(c.id, 2);
    const p = await owner(c.id);
    const first = await mark(p, c.id, l1!.id);
    expect(first.statusCode).toBe(200);
    const a = first.json() as CompletionResponse;
    expect(a).toMatchObject({ completed: true });
    await new Promise((r) => setTimeout(r, 15));
    const again = (await mark(p, c.id, l1!.id)).json() as CompletionResponse;
    expect(again).toEqual(a);
    expect(await rows(p.id, c.id)).toBe(1);
  });

  it("leaves exactly one completion when the same mark arrives many times at once", async () => {
    const c = await mkCourse();
    const [l1] = await mkLessons(c.id, 1);
    const p = await owner(c.id);
    const results = await Promise.all(Array.from({ length: 8 }, () => mark(p, c.id, l1!.id)));
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect(
      new Set(results.map((r) => (r.json() as { completedAt: string }).completedAt)).size,
    ).toBe(1);
    expect(await rows(p.id, c.id)).toBe(1);
  });

  it("unmarks, and repeating it or unmarking a never-marked lesson still succeeds", async () => {
    const c = await mkCourse();
    const [l1, l2] = await mkLessons(c.id, 2);
    const p = await owner(c.id);
    await mark(p, c.id, l1!.id);
    const res = await unmark(p, c.id, l1!.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ completed: false });
    expect((await unmark(p, c.id, l1!.id)).statusCode).toBe(200);
    expect((await unmark(p, c.id, l2!.id)).statusCode).toBe(200);
    expect(await rows(p.id, c.id)).toBe(0);
  });

  it("works for an owner of an unpublished course", async () => {
    const c = await mkCourse();
    const [l1] = await mkLessons(c.id, 1);
    const p = await owner(c.id);
    await courses.unpublish(admin.id, c.id, "req-unpublish");
    expect((await mark(p, c.id, l1!.id)).statusCode).toBe(200);
  });

  it("answers 404 for an unknown lesson, and for a lesson of another course", async () => {
    const c1 = await mkCourse();
    const c2 = await mkCourse();
    const [mine] = await mkLessons(c1.id, 1);
    const [other] = await mkLessons(c2.id, 1);
    const p = await owner(c1.id);
    expect((await mark(p, c1.id, "00000000-0000-4000-8000-000000000000")).statusCode).toBe(404);
    expect((await mark(p, c1.id, other!.id)).statusCode).toBe(404);
    expect((await mark(p, c2.id, mine!.id)).statusCode).toBe(403);
    expect((await unmark(p, c1.id, other!.id)).statusCode).toBe(404);
    expect(await h.db.lessonCompletion.count({ where: { userId: p.id } })).toBe(0);
  });
});

describe("who may record progress", () => {
  it("refuses signed-out callers (401) and people without access (403, ENROLLMENT_REQUIRED)", async () => {
    const c = await mkCourse();
    const [l1] = await mkLessons(c.id, 1);
    const stranger = await person(h);
    for (const attempt of [
      (p?: Person) => mark(p, c.id, l1!.id),
      (p?: Person) => unmark(p, c.id, l1!.id),
      (p?: Person) => call(p, "GET", `/me/courses/${c.id}/progress`),
    ]) {
      expect((await attempt(undefined)).statusCode).toBe(401);
      for (const who of [stranger, instructor, admin]) {
        const res = await attempt(who);
        expect(res.statusCode).toBe(403);
        expect(errorEnvelopeSchema.parse(res.json()).code).toBe("ENROLLMENT_REQUIRED");
      }
    }
    expect(await h.db.lessonCompletion.count({ where: { courseId: c.id } })).toBe(0);
  });

  it("does not tell a non-owner whether a lesson exists", async () => {
    const c = await mkCourse();
    const [l1] = await mkLessons(c.id, 1);
    const stranger = await person(h);
    const real = await mark(stranger, c.id, l1!.id);
    const fake = await mark(stranger, c.id, "00000000-0000-4000-8000-000000000000");
    expect(real.statusCode).toBe(403);
    expect(fake.statusCode).toBe(403);
  });

  it("refuses a revoked owner with the same token, and restores earlier marks if access returns", async () => {
    const c = await mkCourse();
    const [l1, l2] = await mkLessons(c.id, 2);
    const p = await owner(c.id);
    await mark(p, c.id, l1!.id);
    await h.db.entitlement.updateMany({
      where: { userId: p.id, courseId: c.id },
      data: { status: "revoked", revokedAt: new Date(), revokeReason: "Test revoke" },
    });
    expect((await mark(p, c.id, l2!.id)).statusCode).toBe(403);
    expect((await unmark(p, c.id, l1!.id)).statusCode).toBe(403);
    expect((await call(p, "GET", `/me/courses/${c.id}/progress`)).statusCode).toBe(403);
    expect(await rows(p.id, c.id)).toBe(1);
    await enroll(p.id, c.id);
    expect((await read(p, c.id)).lessons.map((l) => l.lessonId)).toEqual([l1!.id]);
  });

  it("keeps each person's progress private", async () => {
    const c = await mkCourse();
    const [l1, l2] = await mkLessons(c.id, 2);
    const a = await owner(c.id);
    const b = await owner(c.id);
    await mark(a, c.id, l1!.id);
    await mark(b, c.id, l2!.id);
    expect((await read(a, c.id)).lessons.map((l) => l.lessonId)).toEqual([l1!.id]);
    expect((await read(b, c.id)).lessons.map((l) => l.lessonId)).toEqual([l2!.id]);
    await unmark(b, c.id, l1!.id);
    expect((await read(a, c.id)).completed).toBe(1);
  });
});

describe("course progress", () => {
  it("counts what exists now and points at the first incomplete lesson", async () => {
    const c = await mkCourse();
    const ls = await mkLessons(c.id, 3);
    const p = await owner(c.id);
    expect(await read(p, c.id)).toMatchObject({ completed: 0, total: 3, nextLessonId: ls[0]!.id });
    await mark(p, c.id, ls[0]!.id);
    await mark(p, c.id, ls[2]!.id);
    expect(await read(p, c.id)).toMatchObject({ completed: 2, total: 3, nextLessonId: ls[1]!.id });
    await mark(p, c.id, ls[1]!.id);
    expect(await read(p, c.id)).toMatchObject({ completed: 3, total: 3, nextLessonId: null });
  });

  it("changes when a lesson is added, deleted or reordered", async () => {
    const c = await mkCourse();
    const ls = await mkLessons(c.id, 2);
    const p = await owner(c.id);
    for (const l of ls) await mark(p, c.id, l.id);
    expect(await read(p, c.id)).toMatchObject({ completed: 2, total: 2, nextLessonId: null });
    const added = await h.db.lesson.create({
      data: { courseId: c.id, title: "Added later", position: 3 },
    });
    expect(await read(p, c.id)).toMatchObject({ completed: 2, total: 3, nextLessonId: added.id });
    await h.db.lesson.delete({ where: { id: ls[0]!.id } });
    await h.db.lesson.update({ where: { id: ls[1]!.id }, data: { position: 1 } });
    await h.db.lesson.update({ where: { id: added.id }, data: { position: 2 } });
    const after = await read(p, c.id);
    expect(after).toMatchObject({ completed: 1, total: 2, nextLessonId: added.id });
    expect(after.lessons.map((l) => l.lessonId)).toEqual([ls[1]!.id]);
  });

  it("reports 0 of 0 and no next lesson for an empty course", async () => {
    const c = await mkCourse();
    const p = await owner(c.id);
    expect(await read(p, c.id)).toEqual({
      completed: 0,
      total: 0,
      nextLessonId: null,
      lessons: [],
    });
  });

  it("follows a reorder through the API: the next lesson follows the new order", async () => {
    const c = await mkCourse();
    const [a, b, d] = await mkLessons(c.id, 3);
    const p = await owner(c.id);
    await mark(p, c.id, a!.id);
    const res = await h.call("PUT", `/staff/courses/${c.id}/lessons/order`, {
      token: admin.accessToken,
      body: { lessonIds: [d!.id, b!.id, a!.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(await read(p, c.id)).toMatchObject({ completed: 1, total: 3, nextLessonId: d!.id });
  });
});

describe("My Courses and the course page", () => {
  it("puts progress on every My Courses item and on the owner's course page only", async () => {
    const c1 = await mkCourse();
    const c2 = await mkCourse();
    const l1 = await mkLessons(c1.id, 3);
    await mkLessons(c2.id, 2);
    const p = await owner(c1.id);
    await enroll(p.id, c2.id);
    await mark(p, c1.id, l1[0]!.id);
    await mark(p, c1.id, l1[1]!.id);
    const mine = (await call(p, "GET", "/me/courses")).json() as Page<MyCourse>;
    const byId = new Map(mine.items.map((i) => [i.id, i.progress]));
    expect(byId.get(c1.id)).toEqual({ completed: 2, total: 3 });
    expect(byId.get(c2.id)).toEqual({ completed: 0, total: 2 });

    const detail = (await call(p, "GET", `/courses/${c1.id}`)).json() as PublicCourseDetail;
    expect(detail).toMatchObject({
      enrolled: true,
      progress: { completed: 2, total: 3 },
      nextLessonId: l1[2]!.id,
    });
    const stranger = await person(h);
    for (const who of [stranger, undefined]) {
      const d = (await call(who, "GET", `/courses/${c1.id}`)).json() as PublicCourseDetail;
      expect(d).toMatchObject({ enrolled: false, progress: null, nextLessonId: null });
    }
  });

  it("uses the same number of queries for one course as for twenty-five", async () => {
    const p = await person(h);
    const db = h.t.app.get(PrismaService);
    const countQueries = async () => {
      const raw = vi.spyOn(db, "$queryRaw");
      const rawUnsafe = vi.spyOn(db, "$queryRawUnsafe");
      const findMany = vi.spyOn(db.entitlement, "findMany");
      try {
        const res = await call(p, "GET", "/me/courses?limit=100");
        expect(res.statusCode).toBe(200);
        return [raw.mock.calls.length, rawUnsafe.mock.calls.length, findMany.mock.calls.length];
      } finally {
        raw.mockRestore();
        rawUnsafe.mockRestore();
        findMany.mockRestore();
      }
    };
    const first = await mkCourse();
    await mkLessons(first.id, 2);
    await enroll(p.id, first.id);
    const one = await countQueries();
    for (let i = 0; i < 24; i++) {
      const c = await mkCourse();
      await mkLessons(c.id, 2);
      await enroll(p.id, c.id);
    }
    const many = await countQueries();
    expect(many).toEqual(one);
    const page = (await call(p, "GET", "/me/courses?limit=100")).json() as Page<MyCourse>;
    expect(page.items).toHaveLength(25);
    expect(page.items.every((i) => i.progress.total === 2)).toBe(true);
  });
});

describe("account deletion", () => {
  it("removes only the deleted person's completions", async () => {
    const c = await mkCourse();
    const [l1] = await mkLessons(c.id, 1);
    const leaving = await owner(c.id);
    const staying = await owner(c.id);
    await mark(leaving, c.id, l1!.id);
    await mark(staying, c.id, l1!.id);
    const res = await h.call("DELETE", "/me", {
      token: leaving.accessToken,
      body: { password: leaving.password },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(await rows(leaving.id, c.id)).toBe(0);
    expect(await rows(staying.id, c.id)).toBe(1);
  });

  it("cancels the deletion when removing completions fails", async () => {
    const c = await mkCourse();
    const [l1] = await mkLessons(c.id, 1);
    const p = await owner(c.id);
    await mark(p, c.id, l1!.id);
    const spy = vi
      .spyOn(h.t.app.get(ProgressService), "deleteForAccount")
      .mockRejectedValue(new Error("down"));
    try {
      const res = await h.call("DELETE", "/me", {
        token: p.accessToken,
        body: { password: p.password },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    } finally {
      spy.mockRestore();
    }
    expect(await rows(p.id, c.id)).toBe(1);
    expect((await h.db.user.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("active");
  });
});

describe("logs", () => {
  it("hold no lesson text or email address from progress calls", async () => {
    const c = await mkCourse();
    const secret = "PROGRESS-LOG-SECRET-8842";
    const l = await h.db.lesson.create({
      data: { courseId: c.id, title: "Logged", body: secret, position: 1 },
    });
    const p = await owner(c.id);
    await mark(p, c.id, l.id);
    await read(p, c.id);
    await unmark(p, c.id, l.id);
    const logs = h.t.logs();
    expect(logs).not.toContain(secret);
    expect(logs.toLowerCase()).not.toContain(p.email.toLowerCase());
  });
});
