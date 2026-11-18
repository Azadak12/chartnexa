import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  errorEnvelopeSchema,
  type MyReviewResponse,
  type Page,
  type PublicCourseDetail,
  type PublicCourseSummary,
  type Review,
} from "@chartnexa/api-contracts";
import { PrismaService } from "../src/database/prisma.service.js";
import { CoursesService } from "../src/modules/courses/index.js";
import { ReviewsService } from "../src/modules/reviews/index.js";
import { person, type Person } from "./access-helpers.js";
import { makeHarness, stripRequestId, type Harness } from "./auth-helpers.js";
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

const mkCourse = async (publish = true) => {
  const c = await courses.create(
    admin.id,
    {
      title: "Review course",
      description: "A complete description",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    } as never,
    "req-course",
  );
  return publish ? courses.publish(admin.id, c.id, "req-publish") : c;
};
const enroll = (userId: string, courseId: string) =>
  h.db.entitlement.create({
    data: { userId, courseId, source: "admin_grant", grantReason: "Test grant" },
  });
const owner = async (courseId: string, displayName?: string) => {
  const p = await person(h);
  await enroll(p.id, courseId);
  if (displayName) await h.db.user.update({ where: { id: p.id }, data: { displayName } });
  return p;
};
const url = (c: string) => `/me/courses/${c}/review`;
const call = (
  p: Person | undefined,
  method: "GET" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) =>
  h.call(method, path, {
    ...(p ? { token: p.accessToken } : {}),
    ...(body !== undefined ? { body } : {}),
  });
const write = (p: Person | undefined, c: string, rating: unknown, body?: string) =>
  call(p, "PUT", url(c), { rating, ...(body !== undefined ? { body } : {}) });
const detail = async (c: string, p?: Person) =>
  (await call(p, "GET", `/courses/${c}`)).json() as PublicCourseDetail;
const truth = async (courseId: string) => {
  const rows = await h.db.review.findMany({ where: { courseId } });
  const course = await h.db.course.findUniqueOrThrow({ where: { id: courseId } });
  return {
    rows: rows.length,
    sum: rows.reduce((a, r) => a + r.rating, 0),
    count: course.ratingCount,
    stored: course.ratingSum,
  };
};
const consistent = async (courseId: string) => {
  const t = await truth(courseId);
  expect([t.count, t.stored]).toEqual([t.rows, t.sum]);
};

describe("writing a review", () => {
  it("lets an owner write one, shows it in the summary, and names them without an email", async () => {
    const c = await mkCourse();
    const p = await owner(c.id, "Ann");
    const res = await write(p, c.id, 4, "  Clear and useful.  ");
    expect(res.statusCode).toBe(200);
    const r = res.json() as Review;
    expect(r).toMatchObject({
      rating: 4,
      body: "Clear and useful.",
      reviewerName: "Ann",
      mine: true,
    });
    expect(Object.keys(r).sort()).toEqual(
      ["body", "createdAt", "id", "mine", "rating", "reviewerName", "updatedAt"].sort(),
    );
    expect(res.body.toLowerCase()).not.toContain(p.email.toLowerCase());
    expect((await detail(c.id)).rating).toEqual({ count: 1, average: 4 });
    const mine = (await call(p, "GET", url(c.id))).json() as MyReviewResponse;
    expect(mine.review?.id).toBe(r.id);
  });

  it("falls back to 'Student' when there is no display name", async () => {
    const c = await mkCourse();
    const p = await owner(c.id);
    const r = (await write(p, c.id, 5)).json() as Review;
    expect(r.reviewerName).toBe("Student");
    expect(r.body).toBe("");
  });

  it("stores markup as typed text", async () => {
    const c = await mkCourse();
    const p = await owner(c.id);
    const r = (await write(p, c.id, 3, "<img src=x onerror=alert(1)>")).json() as Review;
    expect(r.body).toBe("<img src=x onerror=alert(1)>");
  });

  it("names invalid input and saves nothing", async () => {
    const c = await mkCourse();
    const p = await owner(c.id);
    for (const body of [
      {},
      { rating: 0 },
      { rating: 6 },
      { rating: 2.5 },
      { rating: "4" },
      { rating: null },
      { rating: 4, body: "x".repeat(1001) },
      { rating: 4, body: "bell\u0007" },
      { rating: 4, userId: p.id },
    ]) {
      const res = await call(p, "PUT", url(c.id), body);
      expect(res.statusCode, JSON.stringify(body).slice(0, 40)).toBe(400);
      expect(errorEnvelopeSchema.parse(res.json()).code).toBe("VALIDATION_FAILED");
    }
    expect(await h.db.review.count({ where: { courseId: c.id } })).toBe(0);
    await consistent(c.id);
  });
});

describe("who may review", () => {
  it("refuses signed-out callers (401) and people without access (403 ENROLLMENT_REQUIRED)", async () => {
    const c = await mkCourse();
    const stranger = await person(h);
    for (const attempt of [
      (p?: Person) => write(p, c.id, 5),
      (p?: Person) => call(p, "DELETE", url(c.id)),
      (p?: Person) => call(p, "GET", url(c.id)),
    ]) {
      expect((await attempt(undefined)).statusCode).toBe(401);
      for (const who of [stranger, instructor, admin]) {
        const res = await attempt(who);
        expect(res.statusCode).toBe(403);
        expect(errorEnvelopeSchema.parse(res.json()).code).toBe("ENROLLMENT_REQUIRED");
      }
    }
    expect(await h.db.review.count({ where: { courseId: c.id } })).toBe(0);
    await consistent(c.id);
  });

  it("stops a revoked owner on the next request, but keeps their review visible", async () => {
    const c = await mkCourse();
    const p = await owner(c.id, "Rae");
    await write(p, c.id, 5, "Loved it");
    await h.db.entitlement.updateMany({
      where: { userId: p.id, courseId: c.id },
      data: { status: "revoked", revokedAt: new Date(), revokeReason: "Test revoke" },
    });
    expect((await write(p, c.id, 1)).statusCode).toBe(403);
    expect((await call(p, "DELETE", url(c.id))).statusCode).toBe(403);
    expect((await call(p, "GET", url(c.id))).statusCode).toBe(403);
    const list = (await call(undefined, "GET", `/courses/${c.id}/reviews`)).json() as Page<Review>;
    expect(list.items.map((r) => r.body)).toEqual(["Loved it"]);
    expect((await detail(c.id)).rating).toEqual({ count: 1, average: 5 });
  });

  it("only ever changes the caller's own review", async () => {
    const c = await mkCourse();
    const a = await owner(c.id, "A");
    const b = await owner(c.id, "B");
    await write(a, c.id, 5, "A's review");
    await write(b, c.id, 1, "B's review");
    await write(b, c.id, 2, "B changed");
    await call(b, "DELETE", url(c.id));
    const left = await h.db.review.findMany({ where: { courseId: c.id } });
    expect(left.map((r) => [r.userId, r.rating, r.body])).toEqual([[a.id, 5, "A's review"]]);
    await consistent(c.id);
  });
});

describe("one review per person, and an exact summary", () => {
  it("replaces the review when submitted again, keeping one row", async () => {
    const c = await mkCourse();
    const p = await owner(c.id);
    const first = (await write(p, c.id, 5, "Great")).json() as Review;
    const second = (await write(p, c.id, 2, "Not so great")).json() as Review;
    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(await h.db.review.count({ where: { courseId: c.id } })).toBe(1);
    expect((await detail(c.id)).rating).toEqual({ count: 1, average: 2 });
    await consistent(c.id);
  });

  it("changes nothing when the same review is sent again", async () => {
    const c = await mkCourse();
    const p = await owner(c.id);
    const first = (await write(p, c.id, 4, "Same")).json() as Review;
    await new Promise((r) => setTimeout(r, 15));
    const again = (await write(p, c.id, 4, "Same")).json() as Review;
    expect(again).toEqual(first);
    await consistent(c.id);
  });

  it("leaves one review and a correct summary when one person sends many at once", async () => {
    const c = await mkCourse();
    const p = await owner(c.id);
    const results = await Promise.all(
      [1, 2, 3, 4, 5, 4, 3, 2].map((rating) => write(p, c.id, rating, `Rating ${rating}`)),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect(await h.db.review.count({ where: { courseId: c.id } })).toBe(1);
    await consistent(c.id);
    const row = await h.db.review.findFirstOrThrow({ where: { courseId: c.id } });
    expect((await detail(c.id)).rating).toEqual({ count: 1, average: row.rating });
  });

  it("counts ten people writing at the same moment exactly, with the true mean", async () => {
    const c = await mkCourse();
    const people = await Promise.all(Array.from({ length: 10 }, () => owner(c.id)));
    const ratings = [5, 4, 4, 3, 5, 2, 1, 5, 4, 3];
    const results = await Promise.all(people.map((p, i) => write(p, c.id, ratings[i])));
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const mean = Math.round((ratings.reduce((a, b) => a + b, 0) / 10) * 10) / 10;
    expect((await detail(c.id)).rating).toEqual({ count: 10, average: mean });
    await consistent(c.id);
  });

  it("follows edit, delete and rewrite exactly, and a second delete still succeeds", async () => {
    const c = await mkCourse();
    const p = await owner(c.id);
    const q = await owner(c.id);
    await write(q, c.id, 5);
    await write(p, c.id, 1);
    expect((await detail(c.id)).rating).toEqual({ count: 2, average: 3 });
    await write(p, c.id, 4);
    expect((await detail(c.id)).rating).toEqual({ count: 2, average: 4.5 });
    expect((await call(p, "DELETE", url(c.id))).json()).toEqual({ deleted: true });
    expect((await detail(c.id)).rating).toEqual({ count: 1, average: 5 });
    const again = await call(p, "DELETE", url(c.id));
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ deleted: false });
    await write(p, c.id, 2);
    expect((await detail(c.id)).rating).toEqual({ count: 2, average: 3.5 });
    await consistent(c.id);
  });

  it("rounds to one decimal and shows no average for a course without reviews", async () => {
    const c = await mkCourse();
    expect((await detail(c.id)).rating).toEqual({ count: 0, average: null });
    for (const rating of [5, 4, 4]) await write(await owner(c.id), c.id, rating);
    expect((await detail(c.id)).rating).toEqual({ count: 3, average: 4.3 });
  });

  it("keeps the totals equal to the reviews after a long random sequence", async () => {
    const c = await mkCourse();
    const people = await Promise.all(Array.from({ length: 6 }, () => owner(c.id)));
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let round = 0; round < 12; round++) {
      const batch = people
        .filter(() => next() < 0.7)
        .map((p) =>
          next() < 0.25
            ? call(p, "DELETE", url(c.id))
            : write(p, c.id, 1 + Math.floor(next() * 5), `r${round}`),
        );
      const results = await Promise.all(batch);
      expect(results.every((r) => r.statusCode === 200)).toBe(true);
      await consistent(c.id);
    }
  });

  it("rolls back the review and the totals together when a write fails in the middle", async () => {
    const c = await mkCourse();
    const p = await owner(c.id);
    await write(p, c.id, 3, "Before");
    const q = await owner(c.id);
    const service = h.t.app.get(ReviewsService) as unknown as {
      adjust: (...a: unknown[]) => Promise<void>;
    };
    const spy = vi.spyOn(service, "adjust").mockRejectedValue(new Error("down"));
    try {
      expect((await write(q, c.id, 5, "Never saved")).statusCode).toBe(500);
      expect((await write(p, c.id, 1, "Edit never saved")).statusCode).toBe(500);
      expect((await call(p, "DELETE", url(c.id))).statusCode).toBe(500);
    } finally {
      spy.mockRestore();
    }
    const rows = await h.db.review.findMany({ where: { courseId: c.id } });
    expect(rows.map((r) => [r.rating, r.body])).toEqual([[3, "Before"]]);
    await consistent(c.id);
  });

  it("limits how many writes one person can make in a window", async () => {
    const c = await mkCourse();
    const p = await owner(c.id);
    let last = 0;
    for (let i = 0; i < 32; i++) {
      last = (await write(p, c.id, 1 + (i % 5), `n${i}`)).statusCode;
      if (last === 429) break;
    }
    expect(last).toBe(429);
    await consistent(c.id);
  });
});

describe("reading reviews", () => {
  it("lists newest first, ten at a time, with stable paging while reviews change", async () => {
    const c = await mkCourse();
    const people: Person[] = [];
    for (let i = 0; i < 25; i++) {
      const p = await owner(c.id, `Person ${i}`);
      people.push(p);
      await write(p, c.id, 1 + (i % 5), `review ${i}`);
      await new Promise((r) => setTimeout(r, 4));
    }
    const first = (await call(undefined, "GET", `/courses/${c.id}/reviews`)).json() as Page<Review>;
    expect(first.items).toHaveLength(10);
    expect(first.items[0]?.body).toBe("review 24");
    // A new review and a deletion happen between pages: nothing repeats or is skipped.
    const late = await owner(c.id, "Late");
    await write(late, c.id, 5, "late review");
    await call(people[3]!, "DELETE", url(c.id));
    const second = (
      await call(
        undefined,
        "GET",
        `/courses/${c.id}/reviews?cursor=${encodeURIComponent(first.nextCursor!)}`,
      )
    ).json() as Page<Review>;
    const third = (
      await call(
        undefined,
        "GET",
        `/courses/${c.id}/reviews?cursor=${encodeURIComponent(second.nextCursor!)}`,
      )
    ).json() as Page<Review>;
    const seen = [...first.items, ...second.items, ...third.items].map((r) => r.body);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).not.toContain("late review");
    expect(seen).not.toContain("review 3");
    expect(seen).toHaveLength(24);
    expect(third.nextCursor).toBeNull();
  });

  it("shows nothing personal and marks only the caller's own review", async () => {
    const c = await mkCourse();
    const a = await owner(c.id, "Ann");
    const b = await owner(c.id);
    await write(a, c.id, 5, "Ann's");
    await write(b, c.id, 3, "B's");
    const res = await call(a, "GET", `/courses/${c.id}/reviews`);
    const list = res.json() as Page<Review>;
    expect(list.items.map((r) => [r.reviewerName, r.mine])).toEqual([
      ["Student", false],
      ["Ann", true],
    ]);
    for (const who of [a, b]) {
      expect(res.body).not.toContain(who.id);
      expect(res.body.toLowerCase()).not.toContain(who.email.toLowerCase());
    }
    const anon = (await call(undefined, "GET", `/courses/${c.id}/reviews`)).json() as Page<Review>;
    expect(anon.items.every((r) => r.mine === false)).toBe(true);
  });

  it("treats a bad token as signed out, and answers 404 alike for drafts and unknown courses", async () => {
    const draft = await mkCourse(false);
    const unknown = "00000000-0000-4000-8000-000000000000";
    const a = await call(undefined, "GET", `/courses/${draft.id}/reviews`);
    const b = await call(undefined, "GET", `/courses/${unknown}/reviews`);
    expect(a.statusCode).toBe(404);
    expect(stripRequestId(a)).toEqual(stripRequestId(b));
    const published = await mkCourse();
    const res = await h.call("GET", `/courses/${published.id}/reviews`, { token: "garbage" });
    expect(res.statusCode).toBe(200);
    expect((await call(undefined, "GET", "/courses/nope/reviews")).statusCode).toBe(400);
  });

  it("hides an unpublished course's reviews from the public, but not from its owners", async () => {
    const c = await mkCourse();
    const p = await owner(c.id, "Pat");
    await write(p, c.id, 4, "Still here");
    await courses.unpublish(admin.id, c.id, "req-unpublish");
    expect((await call(undefined, "GET", `/courses/${c.id}/reviews`)).statusCode).toBe(404);
    const stranger = await person(h);
    expect((await call(stranger, "GET", `/courses/${c.id}/reviews`)).statusCode).toBe(404);
    const list = (await call(p, "GET", `/courses/${c.id}/reviews`)).json() as Page<Review>;
    expect(list.items.map((r) => r.body)).toEqual(["Still here"]);
    // An owner of the unpublished course can still write and edit.
    expect((await write(p, c.id, 5, "Updated")).statusCode).toBe(200);
  });

  it("shows the summary on catalog cards without extra queries per course", async () => {
    const db = h.t.app.get(PrismaService);
    const count = async () => {
      const raw = vi.spyOn(db, "$queryRawUnsafe");
      const tagged = vi.spyOn(db, "$queryRaw");
      const find = vi.spyOn(db.course, "findMany");
      try {
        const res = await call(undefined, "GET", "/courses?limit=100");
        expect(res.statusCode).toBe(200);
        return {
          calls: [raw.mock.calls.length, tagged.mock.calls.length, find.mock.calls.length],
          res,
        };
      } finally {
        raw.mockRestore();
        tagged.mockRestore();
        find.mockRestore();
      }
    };
    const first = await mkCourse();
    await write(await owner(first.id), first.id, 4);
    const one = await count();
    for (let i = 0; i < 15; i++) {
      const c = await mkCourse();
      await write(await owner(c.id), c.id, 5);
    }
    const many = await count();
    expect(many.calls).toEqual(one.calls);
    const page = many.res.json() as Page<PublicCourseSummary>;
    expect(page.items.length).toBeGreaterThanOrEqual(16);
    expect(page.items.every((i) => i.rating.count >= 0)).toBe(true);
    expect(page.items.find((i) => i.id === first.id)?.rating).toEqual({ count: 1, average: 4 });
  });
});

describe("account deletion", () => {
  it("removes the person's reviews on several courses and corrects every total", async () => {
    const cs = [await mkCourse(), await mkCourse(), await mkCourse()];
    const leaving = await person(h);
    const staying = await person(h);
    for (const c of cs) {
      await enroll(leaving.id, c.id);
      await enroll(staying.id, c.id);
      await write(leaving, c.id, 1);
      await write(staying, c.id, 5);
    }
    const res = await h.call("DELETE", "/me", {
      token: leaving.accessToken,
      body: { password: leaving.password },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(await h.db.review.count({ where: { userId: leaving.id } })).toBe(0);
    for (const c of cs) {
      expect((await detail(c.id)).rating).toEqual({ count: 1, average: 5 });
      await consistent(c.id);
    }
    expect(await h.db.review.count({ where: { userId: staying.id } })).toBe(3);
  });

  it("is cancelled, with everything intact, when removing the reviews fails", async () => {
    const c = await mkCourse();
    const p = await owner(c.id);
    await write(p, c.id, 4, "Keep me");
    const spy = vi
      .spyOn(h.t.app.get(ReviewsService), "deleteForAccount")
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
    expect(await h.db.review.count({ where: { userId: p.id } })).toBe(1);
    expect((await h.db.user.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("active");
    await consistent(c.id);
  });
});

describe("logs", () => {
  it("hold no review text or email address", async () => {
    const c = await mkCourse();
    const p = await owner(c.id);
    const secret = "REVIEW-LOG-SECRET-9921";
    await write(p, c.id, 4, secret);
    await call(p, "GET", url(c.id));
    await call(undefined, "GET", `/courses/${c.id}/reviews`);
    await call(p, "DELETE", url(c.id));
    const logs = h.t.logs();
    expect(logs).not.toContain(secret);
    expect(logs.toLowerCase()).not.toContain(p.email.toLowerCase());
  });
});
