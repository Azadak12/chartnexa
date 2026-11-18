import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  MyReviewResponse,
  Page,
  PublicCourseDetail,
  Review,
  StaffReview,
  StaffReviewActionResponse,
  StaffReviewDetail,
} from "@chartnexa/api-contracts";
import { CoursesService } from "../src/modules/courses/index.js";
import { ModerationService } from "../src/modules/reviews/moderation.service.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let admin: Person;
let manager: Person;
let manager2: Person;
let instructor: Person;
let courses: CoursesService;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
  courses = h.t.app.get(CoursesService);
  admin = await person(h, "admin");
  manager = await person(h, "manager");
  manager2 = await person(h, "manager");
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
      title: "Moderated course",
      description: "A complete description",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    } as never,
    "req-course",
  );
  return publish ? courses.publish(admin.id, c.id, "req-publish") : c;
};
const owner = async (courseId: string, displayName?: string) => {
  const p = await person(h);
  await h.db.entitlement.create({
    data: { userId: p.id, courseId, source: "admin_grant", grantReason: "Test grant" },
  });
  if (displayName) await h.db.user.update({ where: { id: p.id }, data: { displayName } });
  return p;
};
const call = (
  p: Person | undefined,
  method: "GET" | "PUT" | "POST" | "DELETE",
  path: string,
  body?: unknown,
) =>
  h.call(method, path, {
    ...(p ? { token: p.accessToken } : {}),
    ...(body !== undefined ? { body } : {}),
  });

const mine = (c: string) => `/me/courses/${c}/review`;
/** An owner who has written a review; returns the person and the review. */
const reviewed = async (courseId: string, rating = 2, body = "Not for me", name?: string) => {
  const p = await owner(courseId, name);
  const r = (await call(p, "PUT", mine(courseId), { rating, body })).json() as Review;
  return { p, r };
};
const report = (p: Person | undefined, c: string, r: string, reason = "spam", note?: string) =>
  call(p, "POST", `/courses/${c}/reviews/${r}/report`, { reason, ...(note ? { note } : {}) });
const hide = (p: Person | undefined, r: string, reason = "spam", note = "Looks like an ad") =>
  call(p, "POST", `/staff/reviews/${r}/hide`, { reason, note });
const restore = (p: Person | undefined, r: string, note?: string) =>
  call(p, "POST", `/staff/reviews/${r}/restore`, note ? { note } : {});
const appeal = (p: Person | undefined, c: string, message = "This was honest feedback.") =>
  call(p, "POST", `${mine(c)}/appeal`, { message });
const decide = (p: Person | undefined, id: string, decision = "overturn", note?: string) =>
  call(p, "POST", `/staff/review-appeals/${id}/decide`, { decision, ...(note ? { note } : {}) });
const queue = (p: Person | undefined, query: string) => call(p, "GET", `/staff/reviews?${query}`);
const list = async (c: string) =>
  ((await call(undefined, "GET", `/courses/${c}/reviews?limit=50`)).json() as Page<Review>).items;
const detail = async (c: string) =>
  (await call(undefined, "GET", `/courses/${c}`)).json() as PublicCourseDetail;
const getMine = async (p: Person, c: string) =>
  (await call(p, "GET", mine(c))).json() as MyReviewResponse;

/** Totals must equal the count and sum of the visible reviews, always. */
const consistent = async (courseId: string) => {
  const rows = await h.db.review.findMany({ where: { courseId, hiddenAt: null } });
  const course = await h.db.course.findUniqueOrThrow({ where: { id: courseId } });
  expect([course.ratingCount, course.ratingSum]).toEqual([
    rows.length,
    rows.reduce((a, r) => a + r.rating, 0),
  ]);
};

describe("reporting a review", () => {
  it("stores the report and changes nothing anyone sees", async () => {
    const c = await mkCourse();
    const { r } = await reviewed(c.id, 1, "Boring");
    const reporter = await person(h);
    const res = await report(reporter, c.id, r.id, "abusive", "Rude to others");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ reported: true });
    expect((await list(c.id)).map((x) => x.id)).toEqual([r.id]);
    expect((await detail(c.id)).rating).toEqual({ count: 1, average: 1 });
    expect(await h.db.reviewReport.count({ where: { reviewId: r.id } })).toBe(1);
    await consistent(c.id);
  });

  it("refuses the author reporting their own review", async () => {
    const c = await mkCourse();
    const { p, r } = await reviewed(c.id);
    expect((await report(p, c.id, r.id)).statusCode).toBe(403);
    expect(await h.db.reviewReport.count({ where: { reviewId: r.id } })).toBe(0);
  });

  it("keeps exactly one report when the same person reports again, even at once", async () => {
    const c = await mkCourse();
    const { r } = await reviewed(c.id);
    const reporter = await person(h);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => report(reporter, c.id, r.id, "spam")),
    );
    expect(results.map((x) => x.statusCode)).toEqual(Array(6).fill(200));
    expect((await report(reporter, c.id, r.id, "abusive")).statusCode).toBe(200);
    expect(await h.db.reviewReport.count({ where: { reviewId: r.id } })).toBe(1);
    expect(
      await h.db.auditEvent.count({ where: { action: "review.report", targetId: r.id } }),
    ).toBe(1);
  });

  it("answers the same 404 for hidden, unknown, wrong-course and unpublished targets", async () => {
    const c = await mkCourse();
    const other = await mkCourse();
    const { r } = await reviewed(c.id);
    const reporter = await person(h);
    await hide(manager, r.id);
    const unknownId = "00000000-0000-4000-8000-000000000001";
    const draft = await mkCourse(false);
    const bodies = new Set<string>();
    for (const [course, review] of [
      [c.id, r.id], // hidden
      [c.id, unknownId], // unknown review
      [other.id, r.id], // review of another course
      [draft.id, r.id], // unpublished course
      [unknownId, r.id], // unknown course
    ] as const) {
      const res = await report(reporter, course, review);
      expect(res.statusCode).toBe(404);
      bodies.add(JSON.stringify((res.json() as { error?: { message?: string } }).error?.message));
    }
    expect(bodies.size).toBeLessThanOrEqual(2); // review-not-found and course-not-found wording only
    expect(await h.db.reviewReport.count({ where: { reviewId: r.id } })).toBe(0);
  });

  it("refuses bad input and signed-out callers, storing nothing", async () => {
    const c = await mkCourse();
    const { r } = await reviewed(c.id);
    const reporter = await person(h);
    for (const body of [
      {},
      { reason: "low_rating" },
      { reason: "spam", note: "x".repeat(301) },
      { reason: "spam", rating: 1 },
    ]) {
      const res = await call(reporter, "POST", `/courses/${c.id}/reviews/${r.id}/report`, body);
      expect(res.statusCode).toBe(400);
    }
    expect((await report(undefined, c.id, r.id)).statusCode).toBe(401);
    expect(await h.db.reviewReport.count({ where: { reviewId: r.id } })).toBe(0);
  });

  it("limits how many reports one person can send", async () => {
    const db = await createIsolatedDb();
    const hh = await makeHarness(db.url, { RL_REVIEW_REPORT_MAX: "2" });
    try {
      const a = await person(hh, "admin");
      const cs = hh.t.app.get(CoursesService);
      const c0 = await cs.create(
        a.id,
        {
          title: "Limited",
          description: "A complete description",
          level: "beginner",
          priceCents: 0,
          coverTone: "blue",
        } as never,
        "rq",
      );
      const c = await cs.publish(a.id, c0.id, "rp");
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const w = await person(hh);
        const row = await hh.db.review.create({
          data: { userId: w.id, courseId: c.id, rating: 3, body: "" },
        });
        ids.push(row.id);
      }
      const reporter = await person(hh);
      const codes: number[] = [];
      for (const id of ids) {
        codes.push(
          (
            await hh.call("POST", `/courses/${c.id}/reviews/${id}/report`, {
              token: reporter.accessToken,
              body: { reason: "spam" },
            })
          ).statusCode,
        );
      }
      expect(codes).toEqual([200, 200, 429]);
    } finally {
      await hh.t.app.close();
      await db.drop();
    }
  });

  it("never shows who reported to the author or the public", async () => {
    const c = await mkCourse();
    const { p, r } = await reviewed(c.id, 3, "Fine", "Ann");
    const reporter = await person(h);
    await report(reporter, c.id, r.id, "off_topic", "SECRET-REPORT-NOTE");
    const seen = [
      (await call(p, "GET", mine(c.id))).body,
      (await call(undefined, "GET", `/courses/${c.id}/reviews`)).body,
      (await call(p, "GET", `/courses/${c.id}/reviews`)).body,
    ].join("\n");
    expect(seen).not.toContain(reporter.id);
    expect(seen.toLowerCase()).not.toContain(reporter.email.toLowerCase());
    expect(seen).not.toContain("SECRET-REPORT-NOTE");
  });
});

describe("hiding and restoring", () => {
  it("hides: out of the list and totals, text untouched, audited with codes only", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id, 1, "Terrible TEXT-ONE");
    const b = await reviewed(c.id, 5, "Great TEXT-TWO");
    expect((await detail(c.id)).rating).toEqual({ count: 2, average: 3 });
    const res = await hide(manager, a.r.id, "abusive", "NOTE-ABOUT-ABUSE");
    expect(res.statusCode).toBe(200);
    const out = res.json() as StaffReviewActionResponse;
    expect(out.changed).toBe(true);
    expect(out.review).toMatchObject({ hidden: true, hiddenReason: "abusive", rating: 1 });
    expect((await list(c.id)).map((x) => x.id)).toEqual([b.r.id]);
    expect((await detail(c.id)).rating).toEqual({ count: 1, average: 5 });
    const row = await h.db.review.findUniqueOrThrow({ where: { id: a.r.id } });
    expect([row.rating, row.body]).toEqual([1, "Terrible TEXT-ONE"]);
    await consistent(c.id);
    const audit = await auditRows(h, { action: "review.hide", targetId: a.r.id });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorUserId: manager.id,
      reason: "abusive",
      outcome: "success",
    });
    expect(audit[0]!.after).toMatchObject({ courseId: c.id, rating: 1 });
    const dump = JSON.stringify(audit);
    for (const secret of ["TEXT-ONE", "NOTE-ABOUT-ABUSE", a.p.email.toLowerCase()]) {
      expect(dump.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });

  it("restores: back in the list and the totals", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id, 2);
    await hide(manager, a.r.id);
    const res = await restore(manager2, a.r.id);
    expect((res.json() as StaffReviewActionResponse).changed).toBe(true);
    expect((await list(c.id)).map((x) => x.id)).toEqual([a.r.id]);
    expect((await detail(c.id)).rating).toEqual({ count: 1, average: 2 });
    const row = await h.db.review.findUniqueOrThrow({ where: { id: a.r.id } });
    expect([row.hiddenAt, row.hiddenById, row.hiddenReason, row.hiddenNote]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    await consistent(c.id);
  });

  it("needs a reason from the list, and an explanation for 'other'", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id);
    for (const body of [
      {},
      { reason: "low_rating", note: "negative" },
      { reason: "other", note: "short" },
      { reason: "other" },
      { reason: "spam", note: "x".repeat(501) },
      { reason: "spam", rating: 5 },
    ]) {
      expect((await call(manager, "POST", `/staff/reviews/${a.r.id}/hide`, body)).statusCode).toBe(
        400,
      );
    }
    expect((await hide(manager, a.r.id, "other", "Contains a phone number")).statusCode).toBe(200);
    expect((await list(c.id)).length).toBe(0);
  });

  it("is idempotent: no change and no second audit entry", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id, 4);
    expect(((await restore(manager, a.r.id)).json() as StaffReviewActionResponse).changed).toBe(
      false,
    );
    expect(((await hide(manager, a.r.id)).json() as StaffReviewActionResponse).changed).toBe(true);
    expect(
      ((await hide(manager2, a.r.id, "abusive")).json() as StaffReviewActionResponse).changed,
    ).toBe(false);
    expect(
      await h.db.auditEvent.count({ where: { action: "review.hide", targetId: a.r.id } }),
    ).toBe(1);
    const row = await h.db.review.findUniqueOrThrow({ where: { id: a.r.id } });
    expect([row.hiddenById, row.hiddenReason]).toEqual([manager.id, "spam"]);
    await restore(manager, a.r.id);
    await restore(manager, a.r.id);
    expect(
      await h.db.auditEvent.count({ where: { action: "review.restore", targetId: a.r.id } }),
    ).toBe(1);
    await consistent(c.id);
  });

  it("refuses everyone without the permission, and unknown reviews", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id);
    const student = await person(h);
    for (const who of [student, instructor, a.p]) {
      expect((await hide(who, a.r.id)).statusCode).toBe(403);
      expect((await restore(who, a.r.id)).statusCode).toBe(403);
    }
    expect((await hide(undefined, a.r.id)).statusCode).toBe(401);
    expect((await hide(manager, "00000000-0000-4000-8000-000000000002")).statusCode).toBe(404);
    expect((await list(c.id)).length).toBe(1);
    await consistent(c.id);
  });

  it("leaves a review visible however many people report it", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id, 1);
    for (let i = 0; i < 6; i++) await report(await person(h), c.id, a.r.id, "abusive");
    expect((await list(c.id)).length).toBe(1);
    expect((await detail(c.id)).rating.count).toBe(1);
    expect((await h.db.review.findUniqueOrThrow({ where: { id: a.r.id } })).hiddenAt).toBeNull();
  });

  it("resolves the open reports when hiding, so the Reported tab empties", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id);
    await report(await person(h), c.id, a.r.id);
    await hide(manager, a.r.id);
    expect(await h.db.reviewReport.count({ where: { reviewId: a.r.id, resolvedAt: null } })).toBe(
      0,
    );
    const rows = (await queue(manager, `tab=reported&courseId=${c.id}`).then((x) =>
      x.json(),
    )) as Page<StaffReview>;
    expect(rows.items).toEqual([]);
  });

  it("keeps settled reports out of the Reported tab after a restore, and shows new ones", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id);
    const first = await person(h);
    await report(first, c.id, a.r.id, "spam");
    await hide(manager, a.r.id);
    await restore(manager2, a.r.id);
    const tab = async () =>
      ((await queue(manager, `tab=reported&courseId=${c.id}`)).json() as Page<StaffReview>).items;
    expect(await tab()).toEqual([]);
    await report(await person(h), c.id, a.r.id, "abusive");
    expect((await tab()).map((x) => [x.id, x.openReportCount])).toEqual([[a.r.id, 1]]);
  });

  it("keeps totals equal to the visible reviews through a random mix of actions", async () => {
    const c = await mkCourse();
    const people = await Promise.all(Array.from({ length: 5 }, () => owner(c.id)));
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let i = 0; i < 60; i++) {
      const p = people[rnd(people.length)]!;
      const op = rnd(5);
      const row = await h.db.review.findUnique({
        where: { userId_courseId: { userId: p.id, courseId: c.id } },
      });
      if (op === 0) await call(p, "PUT", mine(c.id), { rating: 1 + rnd(5), body: `t${i}` });
      else if (op === 1) await call(p, "DELETE", mine(c.id));
      else if (row && op === 2) await hide(rnd(2) ? manager : manager2, row.id);
      else if (row && op === 3) await restore(manager, row.id);
      else await call(p, "PUT", mine(c.id), { rating: 1 + rnd(5) });
      await consistent(c.id);
    }
  });

  it("serializes a hiding against the author's edit and delete", async () => {
    for (let round = 0; round < 8; round++) {
      const c = await mkCourse();
      const a = await reviewed(c.id, 5);
      const other = await reviewed(c.id, 3);
      await Promise.all([
        hide(manager, a.r.id),
        call(a.p, "PUT", mine(c.id), { rating: 1 + (round % 5), body: "edited" }),
        round % 2 ? call(a.p, "DELETE", mine(c.id)) : hide(manager2, a.r.id),
      ]);
      await consistent(c.id);
      expect(await h.db.review.findUnique({ where: { id: other.r.id } })).not.toBeNull();
    }
  });

  it("rolls the hiding and the totals back together when a write fails in the middle", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id, 4);
    const service = h.t.app.get(ModerationService) as unknown as {
      adjust: (...x: unknown[]) => Promise<void>;
    };
    const spy = vi.spyOn(service, "adjust").mockRejectedValue(new Error("down"));
    try {
      expect((await hide(manager, a.r.id)).statusCode).toBeGreaterThanOrEqual(500);
    } finally {
      spy.mockRestore();
    }
    expect((await h.db.review.findUniqueOrThrow({ where: { id: a.r.id } })).hiddenAt).toBeNull();
    expect(
      await h.db.auditEvent.count({ where: { action: "review.hide", targetId: a.r.id } }),
    ).toBe(0);
    await consistent(c.id);
  });
});

describe("staff cannot rewrite a review", () => {
  it("leaves the text and rating alone, and the writing route only reaches the caller's own", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id, 2, "Original words");
    await hide(manager, a.r.id);
    await restore(manager, a.r.id);
    const viaWrite = await call(manager, "PUT", mine(c.id), { rating: 5, body: "Rewritten" });
    expect(viaWrite.statusCode).toBe(403); // not an owner of the course
    const row = await h.db.review.findUniqueOrThrow({ where: { id: a.r.id } });
    expect([row.rating, row.body]).toEqual([2, "Original words"]);
    for (const path of [`/staff/reviews/${a.r.id}`, `/staff/reviews/${a.r.id}/hide`]) {
      expect((await call(manager, "PUT", path, { rating: 5 })).statusCode).toBeGreaterThanOrEqual(
        404,
      );
      expect(
        (await call(manager, "PATCH" as never, path, { rating: 5 })).statusCode,
      ).toBeGreaterThanOrEqual(404);
    }
  });
});

describe("the author's side of a hiding", () => {
  it("shows the reason, the note and whether they can appeal", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id);
    expect((await getMine(a.p, c.id)).moderation).toBeNull();
    await hide(manager, a.r.id, "personal_info", "Contains a phone number");
    const m = (await getMine(a.p, c.id)).moderation;
    expect(m).toMatchObject({
      state: "hidden",
      reason: "personal_info",
      note: "Contains a phone number",
      canAppeal: true,
      appeal: null,
    });
    expect(JSON.stringify(m)).not.toContain(manager.id);
  });

  it("can be edited or deleted while hidden without moving the totals or the state", async () => {
    const c = await mkCourse();
    const keep = await reviewed(c.id, 5);
    const a = await reviewed(c.id, 1);
    await hide(manager, a.r.id);
    expect((await detail(c.id)).rating).toEqual({ count: 1, average: 5 });
    const edit = await call(a.p, "PUT", mine(c.id), { rating: 4, body: "Reworded politely" });
    expect(edit.statusCode).toBe(200);
    const after = await getMine(a.p, c.id);
    expect(after.review).toMatchObject({ rating: 4, body: "Reworded politely" });
    expect(after.moderation?.state).toBe("hidden");
    expect((await detail(c.id)).rating).toEqual({ count: 1, average: 5 });
    await consistent(c.id);
    expect((await call(a.p, "DELETE", mine(c.id))).json()).toEqual({ deleted: true });
    expect((await detail(c.id)).rating).toEqual({ count: 1, average: 5 });
    await consistent(c.id);
    expect(await h.db.reviewReport.count({ where: { reviewId: a.r.id } })).toBe(0);
    expect((await call(a.p, "PUT", mine(c.id), { rating: 3 })).statusCode).toBe(200);
    expect(keep.r.id).toBeTruthy();
    await consistent(c.id);
  });

  it("allows one appeal per hiding and refuses everything else", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id);
    expect((await appeal(a.p, c.id)).statusCode).toBe(404); // not hidden
    await hide(manager, a.r.id);
    const first = await appeal(a.p, c.id, "I wrote this honestly.");
    expect(first.statusCode).toBe(200);
    const body = first.json() as MyReviewResponse;
    expect(body.moderation).toMatchObject({
      canAppeal: false,
      appeal: { status: "open", message: "I wrote this honestly." },
    });
    expect((await appeal(a.p, c.id)).statusCode).toBe(409);
    expect(await h.db.reviewAppeal.count({ where: { reviewId: a.r.id } })).toBe(1);
    const stranger = await owner(c.id);
    expect((await appeal(stranger, c.id)).statusCode).toBe(404); // has no review
    const outsider = await person(h);
    expect((await appeal(outsider, c.id)).statusCode).toBe(403);
    expect((await appeal(undefined, c.id)).statusCode).toBe(401);
    expect((await call(a.p, "POST", `${mine(c.id)}/appeal`, { message: "  " })).statusCode).toBe(
      400,
    );
  });

  it("keeps one appeal when the author sends it many times at once", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id);
    await hide(manager, a.r.id);
    const res = await Promise.all(Array.from({ length: 6 }, () => appeal(a.p, c.id)));
    expect(res.filter((x) => x.statusCode === 200)).toHaveLength(1);
    expect(res.filter((x) => x.statusCode === 409)).toHaveLength(5);
    expect(await h.db.reviewAppeal.count({ where: { reviewId: a.r.id } })).toBe(1);
  });

  it("allows a new appeal when the review is hidden again after a restore", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id);
    await hide(manager, a.r.id);
    await appeal(a.p, c.id);
    await restore(manager2, a.r.id, "Looked again");
    const settled = await h.db.reviewAppeal.findFirstOrThrow({ where: { reviewId: a.r.id } });
    expect([settled.status, settled.decidedById, settled.decidedNote]).toEqual([
      "overturned",
      manager2.id,
      "Looked again",
    ]);
    await new Promise((r) => setTimeout(r, 5));
    await hide(manager, a.r.id, "abusive");
    expect((await getMine(a.p, c.id)).moderation).toMatchObject({ canAppeal: true, appeal: null });
    expect((await appeal(a.p, c.id)).statusCode).toBe(200);
    expect(await h.db.reviewAppeal.count({ where: { reviewId: a.r.id } })).toBe(2);
  });
});

describe("deciding appeals", () => {
  const setup = async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id, 2);
    await hide(manager, a.r.id);
    await appeal(a.p, c.id);
    const ap = await h.db.reviewAppeal.findFirstOrThrow({ where: { reviewId: a.r.id } });
    return { c, a, ap };
  };

  it("lets another moderator overturn: the review returns and the author sees the decision", async () => {
    const { c, a, ap } = await setup();
    const res = await decide(manager2, ap.id, "overturn", "You are right");
    expect(res.statusCode).toBe(200);
    expect((res.json() as StaffReviewActionResponse).review.hidden).toBe(false);
    expect((await list(c.id)).map((x) => x.id)).toEqual([a.r.id]);
    expect((await detail(c.id)).rating).toEqual({ count: 1, average: 2 });
    await consistent(c.id);
    const mineNow = await getMine(a.p, c.id);
    expect(mineNow.moderation).toBeNull();
    const audit = await auditRows(h, { action: "review.appeal.decide", targetId: a.r.id });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain("You are right");
  });

  it("lets another moderator uphold: the review stays hidden and the author sees why", async () => {
    const { c, a, ap } = await setup();
    expect((await decide(admin, ap.id, "uphold", "Still an ad")).statusCode).toBe(200);
    expect((await list(c.id)).length).toBe(0);
    const m = (await getMine(a.p, c.id)).moderation;
    expect(m).toMatchObject({
      state: "hidden",
      canAppeal: false,
      appeal: { status: "upheld", decidedNote: "Still an ad" },
    });
    await consistent(c.id);
  });

  it("stops the moderator who hid it, but lets an Admin decide", async () => {
    const { c, a, ap } = await setup();
    const own = await decide(manager, ap.id, "overturn");
    expect(own.statusCode).toBe(403);
    expect((await h.db.reviewAppeal.findUniqueOrThrow({ where: { id: ap.id } })).status).toBe(
      "open",
    );
    expect((await list(c.id)).length).toBe(0);
    // An Admin who hid a review may decide its appeal.
    const b = await reviewed(c.id, 4);
    await hide(admin, b.r.id);
    await appeal(b.p, c.id);
    const ap2 = await h.db.reviewAppeal.findFirstOrThrow({ where: { reviewId: b.r.id } });
    expect((await decide(admin, ap2.id, "uphold")).statusCode).toBe(200);
    expect(a.r.id).toBeTruthy();
  });

  it("answers 409 when decided twice, and refuses the unprivileged", async () => {
    const { ap } = await setup();
    const student = await person(h);
    for (const who of [student, instructor])
      expect((await decide(who, ap.id)).statusCode).toBe(403);
    expect((await decide(undefined, ap.id)).statusCode).toBe(401);
    expect((await decide(manager2, ap.id, "uphold")).statusCode).toBe(200);
    expect((await decide(manager2, ap.id, "overturn")).statusCode).toBe(409);
    expect((await decide(admin, "00000000-0000-4000-8000-000000000003")).statusCode).toBe(404);
    expect((await decide(manager2, ap.id, "maybe")).statusCode).toBe(400);
  });

  it("applies one decision when two moderators decide at the same moment", async () => {
    const { c, ap } = await setup();
    const res = await Promise.all([
      decide(manager2, ap.id, "overturn"),
      decide(admin, ap.id, "uphold"),
    ]);
    expect(res.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    await consistent(c.id);
  });
});

describe("the moderators' queue", () => {
  it("lists reported, hidden and appealed reviews, newest activity first, in stable pages", async () => {
    const c = await mkCourse();
    const items = [];
    for (let i = 0; i < 5; i++) items.push(await reviewed(c.id, 1 + i, `body ${i}`));
    for (const it of items) await report(await person(h), c.id, it.r.id, "spam");
    await report(await person(h), c.id, items[0]!.r.id, "abusive");
    const pageOne = (await queue(manager, `tab=reported&courseId=${c.id}&limit=2`).then((x) =>
      x.json(),
    )) as Page<StaffReview>;
    expect(pageOne.items).toHaveLength(2);
    expect(pageOne.items[0]!.id).toBe(items[0]!.r.id); // latest report
    expect(pageOne.items[0]).toMatchObject({ openReportCount: 2, hidden: false });
    const ids = [...pageOne.items.map((x) => x.id)];
    let cursor = pageOne.nextCursor;
    // A new report arrives while paging; it must not repeat or skip anything already passed.
    await report(await person(h), c.id, items[4]!.r.id, "off_topic");
    while (cursor) {
      const next = (await queue(
        manager,
        `tab=reported&courseId=${c.id}&limit=2&cursor=${encodeURIComponent(cursor)}`,
      ).then((x) => x.json())) as Page<StaffReview>;
      ids.push(...next.items.map((x) => x.id));
      cursor = next.nextCursor;
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    await hide(manager, items[1]!.r.id);
    await appeal(items[1]!.p, c.id);
    const hidden = (await queue(manager, `tab=hidden&courseId=${c.id}`).then((x) =>
      x.json(),
    )) as Page<StaffReview>;
    expect(hidden.items.map((x) => x.id)).toEqual([items[1]!.r.id]);
    expect(hidden.items[0]).toMatchObject({ hidden: true, hiddenReason: "spam", openAppeal: true });
    const appeals = (await queue(admin, `tab=appeals&courseId=${c.id}`).then((x) =>
      x.json(),
    )) as Page<StaffReview>;
    expect(appeals.items.map((x) => x.id)).toEqual([items[1]!.r.id]);
  });

  it("shows reports to staff only and the right history in the detail", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id, 3, "Mixed", "Ann");
    const reporter = await person(h);
    await report(reporter, c.id, a.r.id, "personal_info", "Has an address");
    const res = await call(manager, "GET", `/staff/reviews/${a.r.id}`);
    const d = res.json() as StaffReviewDetail;
    expect(d.reports).toMatchObject([
      { reason: "personal_info", note: "Has an address", resolved: false },
    ]);
    expect(d).toMatchObject({
      reviewerName: "Ann",
      courseTitle: "Moderated course",
      hiddenByMe: false,
    });
    expect(res.body).not.toContain(reporter.email);
    expect(res.body.toLowerCase()).not.toContain(a.p.email.toLowerCase());
    await hide(manager, a.r.id);
    expect(
      ((await call(manager, "GET", `/staff/reviews/${a.r.id}`)).json() as StaffReviewDetail)
        .hiddenByMe,
    ).toBe(true);
    expect(
      (await call(manager, "GET", "/staff/reviews/00000000-0000-4000-8000-000000000004"))
        .statusCode,
    ).toBe(404);
  });

  it("refuses non-moderators and bad queries", async () => {
    const student = await person(h);
    for (const who of [student, instructor]) {
      expect((await queue(who, "tab=reported")).statusCode).toBe(403);
    }
    expect((await queue(undefined, "tab=reported")).statusCode).toBe(401);
    expect((await queue(manager, "tab=everything")).statusCode).toBe(400);
    expect((await queue(manager, "tab=hidden&cursor=garbage")).statusCode).toBe(400);
  });

  it("refuses the same token once the permission is removed", async () => {
    const temp = await person(h, "manager");
    expect((await queue(temp, "tab=hidden")).statusCode).toBe(200);
    await h.db.userRole.updateMany({
      where: { userId: temp.id, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: "test" },
    });
    expect((await queue(temp, "tab=hidden")).statusCode).toBe(403);
    const c = await mkCourse();
    const a = await reviewed(c.id);
    expect((await hide(temp, a.r.id)).statusCode).toBe(403);
  });
});

describe("account deletion and moderation", () => {
  it("deletes a hidden review with its reports and appeals and keeps totals right", async () => {
    const c = await mkCourse();
    const keep = await reviewed(c.id, 5);
    const leaving = await reviewed(c.id, 1);
    const reporter = await person(h);
    await report(reporter, c.id, keep.r.id, "spam");
    await hide(manager, leaving.r.id);
    await appeal(leaving.p, c.id);
    await call(leaving.p, "POST", `/courses/${c.id}/reviews/${keep.r.id}/report`, {
      reason: "spam",
    });
    const res = await h.db.review.count({ where: { courseId: c.id } });
    expect(res).toBe(2);
    const del = await h.call("DELETE", "/me", {
      token: leaving.p.accessToken,
      body: { password: leaving.p.password },
    });
    expect(del.statusCode).toBeLessThan(300);
    expect(await h.db.review.count({ where: { userId: leaving.p.id } })).toBe(0);
    expect(await h.db.reviewAppeal.count({ where: { reviewId: leaving.r.id } })).toBe(0);
    expect(await h.db.reviewReport.count({ where: { reporterId: leaving.p.id } })).toBe(0);
    expect((await detail(c.id)).rating).toEqual({ count: 1, average: 5 });
    await consistent(c.id);
  });

  it("keeps the review hidden when the moderator who hid it disappears", async () => {
    const c = await mkCourse();
    const a = await reviewed(c.id, 2);
    // A bare account that has nothing else attached, so it can be removed outright.
    const temp = await h.db.user.create({ data: { email: `gone-${Date.now()}@example.test` } });
    await h.db.review.update({
      where: { id: a.r.id },
      data: {
        hiddenAt: new Date(),
        hiddenById: temp.id,
        hiddenReason: "spam",
        hiddenNote: "",
      },
    });
    await h.db
      .$executeRaw`UPDATE courses SET rating_count = rating_count - 1, rating_sum = rating_sum - 2 WHERE id = ${c.id}::uuid`;
    await h.db.user.delete({ where: { id: temp.id } });
    const row = await h.db.review.findUniqueOrThrow({ where: { id: a.r.id } });
    expect(row.hiddenAt).not.toBeNull();
    expect(row.hiddenById).toBeNull();
    await appeal(a.p, c.id);
    const ap = await h.db.reviewAppeal.findFirstOrThrow({ where: { reviewId: a.r.id } });
    expect((await decide(manager2, ap.id, "uphold")).statusCode).toBe(200);
    await consistent(c.id);
  });
});

describe("logs", () => {
  it("hold no review text, notes, messages or email addresses", async () => {
    const c = await mkCourse();
    const secret = "MOD-LOG-SECRET-4417";
    const a = await reviewed(c.id, 2, secret);
    const reporter = await person(h);
    await report(reporter, c.id, a.r.id, "other", secret);
    await hide(manager, a.r.id, "other", `${secret} note long enough`);
    await appeal(a.p, c.id, secret);
    await call(manager, "GET", `/staff/reviews/${a.r.id}`);
    const logs = h.t.logs().toLowerCase();
    expect(logs).not.toContain(secret.toLowerCase());
    expect(logs).not.toContain(a.p.email.toLowerCase());
    const audit = JSON.stringify(await auditRows(h, { targetId: a.r.id })).toLowerCase();
    expect(audit).not.toContain(secret.toLowerCase());
    expect(audit).not.toContain(a.p.email.toLowerCase());
    expect(audit).not.toContain(reporter.email.toLowerCase());
  });
});
