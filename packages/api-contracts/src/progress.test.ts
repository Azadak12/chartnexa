import { describe, expect, it } from "vitest";
import { publicCourseDetailSchema } from "./courses.js";
import { myCourseSchema } from "./entitlements.js";
import {
  completionResponseSchema,
  courseProgressSchema,
  progressResponseSchema,
} from "./progress.js";

describe("progress schemas", () => {
  it("accepts counts and rejects negatives and fractions", () => {
    expect(courseProgressSchema.safeParse({ completed: 3, total: 8 }).success).toBe(true);
    expect(courseProgressSchema.safeParse({ completed: 0, total: 0 }).success).toBe(true);
    expect(courseProgressSchema.safeParse({ completed: -1, total: 8 }).success).toBe(false);
    expect(courseProgressSchema.safeParse({ completed: 1.5, total: 8 }).success).toBe(false);
  });

  it("tells a completed response from a not-completed one", () => {
    expect(
      completionResponseSchema.safeParse({
        completed: true,
        completedAt: "2026-11-18T00:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(completionResponseSchema.safeParse({ completed: true }).success).toBe(false);
    expect(completionResponseSchema.safeParse({ completed: false }).success).toBe(true);
  });

  it("parses a progress response with and without a next lesson", () => {
    const base = { completed: 1, total: 2, lessons: [{ lessonId: "l1", completedAt: "t" }] };
    expect(progressResponseSchema.safeParse({ ...base, nextLessonId: "l2" }).success).toBe(true);
    expect(progressResponseSchema.safeParse({ ...base, nextLessonId: null }).success).toBe(true);
    expect(progressResponseSchema.safeParse(base).success).toBe(false);
  });

  it("older course and my-course responses still parse with safe defaults", () => {
    const mine = myCourseSchema.parse({
      id: "c",
      title: "t",
      summary: "s",
      level: "beginner",
      priceCents: 0,
      currency: "USD",
      coverTone: "blue",
      onSale: true,
      enrolledAt: "2026-11-18T00:00:00.000Z",
    });
    expect(mine.progress).toEqual({ completed: 0, total: 0 });
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
    expect(detail).toMatchObject({ progress: null, nextLessonId: null });
  });
});
