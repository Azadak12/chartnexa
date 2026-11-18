import { describe, expect, it } from "vitest";
import { publicCourseDetailSchema, publicCourseSummarySchema } from "./courses.js";
import {
  appealReviewRequestSchema,
  courseRatingSchema,
  decideAppealRequestSchema,
  hideReviewRequestSchema,
  REVIEW_REASONS,
  reportReviewRequestSchema,
  restoreReviewRequestSchema,
  myReviewResponseSchema,
  REVIEW_BODY_MAX,
  reviewSchema,
  writeReviewRequestSchema,
} from "./reviews.js";

describe("writing a review", () => {
  it("accepts ratings 1 to 5 with or without text and trims it", () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(writeReviewRequestSchema.safeParse({ rating }).success).toBe(true);
    }
    expect(writeReviewRequestSchema.parse({ rating: 4, body: "  Clear and useful.  " })).toEqual({
      rating: 4,
      body: "Clear and useful.",
    });
    expect(writeReviewRequestSchema.parse({ rating: 5 }).body).toBe("");
  });

  it("rejects missing, out-of-range and fractional ratings, with a plain message", () => {
    for (const rating of [undefined, 0, 6, -1, 3.5, "4", null, Number.NaN]) {
      const r = writeReviewRequestSchema.safeParse({ rating });
      expect(r.success, String(rating)).toBe(false);
    }
    const r = writeReviewRequestSchema.safeParse({ rating: 9 });
    expect(r.success ? "" : r.error.issues[0]?.message).toBe("Choose a rating from 1 to 5 stars");
  });

  it("limits the text and refuses control characters and unknown fields", () => {
    expect(
      writeReviewRequestSchema.safeParse({ rating: 3, body: "x".repeat(REVIEW_BODY_MAX) }).success,
    ).toBe(true);
    for (const body of ["x".repeat(REVIEW_BODY_MAX + 1), "bell\u0007", "nul\u0000"]) {
      expect(
        writeReviewRequestSchema.safeParse({ rating: 3, body }).success,
        body.slice(0, 6),
      ).toBe(false);
    }
    expect(writeReviewRequestSchema.safeParse({ rating: 3, userId: "someone" }).success).toBe(
      false,
    );
    expect(
      writeReviewRequestSchema.parse({ rating: 3, body: "line one\nline two\ttab" }).body,
    ).toBe("line one\nline two\ttab");
  });

  it("keeps markup as typed text", () => {
    expect(writeReviewRequestSchema.parse({ rating: 3, body: "<b>hi</b>" }).body).toBe("<b>hi</b>");
  });
});

describe("what anyone may see", () => {
  const base = {
    id: "r1",
    rating: 5,
    body: "Great",
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
    reviewerName: "Ann",
    mine: false,
  };

  it("has no email or user id", () => {
    const parsed = reviewSchema.parse({ ...base, email: "a@b.co", userId: "u1" });
    expect(Object.keys(parsed).sort()).toEqual(
      ["body", "createdAt", "id", "mine", "rating", "reviewerName", "updatedAt"].sort(),
    );
  });

  it("allows no review of your own", () => {
    expect(myReviewResponseSchema.safeParse({ review: null }).success).toBe(true);
    expect(myReviewResponseSchema.safeParse({ review: base }).success).toBe(true);
  });

  it("rating summaries need counts and a real average", () => {
    expect(courseRatingSchema.safeParse({ count: 12, average: 4.5 }).success).toBe(true);
    expect(courseRatingSchema.safeParse({ count: 0, average: null }).success).toBe(true);
    for (const bad of [
      { count: -1, average: null },
      { count: 1, average: 6 },
      { count: 1, average: 0 },
    ]) {
      expect(courseRatingSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("older course summaries and details still parse, with no rating", () => {
    const card = publicCourseSummarySchema.parse({
      id: "c",
      title: "t",
      summary: "s",
      level: "beginner",
      priceCents: 0,
      currency: "USD",
      coverTone: "blue",
      publishedAt: "2026-11-18T00:00:00.000Z",
    });
    expect(card.rating).toEqual({ count: 0, average: null });
    const detail = publicCourseDetailSchema.parse({
      id: "c",
      title: "t",
      description: "d",
      level: "beginner",
      priceCents: 0,
      currency: "USD",
      coverTone: "blue",
      publishedAt: null,
      lessonCount: 0,
      previewCount: 0,
    });
    expect(detail.rating).toEqual({ count: 0, average: null });
  });
});

describe("moderation requests", () => {
  it("offers no reason about the rating", () => {
    expect([...REVIEW_REASONS].join(" ")).not.toMatch(/rating|star|low|negative|disagree/i);
  });

  it("accepts every listed reason and rejects anything else", () => {
    for (const reason of REVIEW_REASONS) {
      expect(reportReviewRequestSchema.safeParse({ reason }).success).toBe(true);
    }
    for (const reason of ["low_rating", "", undefined, 3, "SPAM"]) {
      const r = reportReviewRequestSchema.safeParse({ reason });
      expect(r.success).toBe(false);
    }
  });

  it("limits and cleans notes", () => {
    expect(
      reportReviewRequestSchema.safeParse({ reason: "spam", note: "x".repeat(301) }).success,
    ).toBe(false);
    expect(reportReviewRequestSchema.parse({ reason: "spam", note: "  hi " }).note).toBe("hi");
    expect(reportReviewRequestSchema.safeParse({ reason: "spam", note: "a\u0000b" }).success).toBe(
      false,
    );
    expect(
      hideReviewRequestSchema.safeParse({ reason: "spam", note: "x".repeat(501) }).success,
    ).toBe(false);
  });

  it("requires an explanation of at least 10 characters for 'other' when hiding", () => {
    const bad = hideReviewRequestSchema.safeParse({ reason: "other", note: "too short" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.path).toEqual(["note"]);
    expect(
      hideReviewRequestSchema.safeParse({ reason: "other", note: "x".repeat(10) }).success,
    ).toBe(true);
    expect(hideReviewRequestSchema.safeParse({ reason: "spam" }).success).toBe(true);
  });

  it("rejects unknown fields, so a rating or text cannot ride along", () => {
    expect(hideReviewRequestSchema.safeParse({ reason: "spam", rating: 1 }).success).toBe(false);
    expect(restoreReviewRequestSchema.safeParse({ body: "rewritten" }).success).toBe(false);
  });

  it("needs an appeal message and a clear decision", () => {
    expect(appealReviewRequestSchema.safeParse({ message: "   " }).success).toBe(false);
    expect(appealReviewRequestSchema.safeParse({ message: "x".repeat(501) }).success).toBe(false);
    expect(appealReviewRequestSchema.safeParse({ message: "This is fair feedback." }).success).toBe(
      true,
    );
    expect(decideAppealRequestSchema.safeParse({ decision: "maybe" }).success).toBe(false);
    expect(decideAppealRequestSchema.safeParse({ decision: "overturn" }).success).toBe(true);
  });

  it("parses an older own-review response without a moderation field", () => {
    expect(myReviewResponseSchema.parse({ review: null }).moderation).toBeNull();
  });
});
