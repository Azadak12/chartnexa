import { describe, expect, it } from "vitest";
import { publicCourseDetailSchema, publicCourseSummarySchema } from "./courses.js";
import {
  courseRatingSchema,
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
