import { describe, expect, it } from "vitest";
import {
  createLessonRequestSchema,
  LESSON_BODY_MAX,
  LESSON_TITLE_MAX,
  MAX_LESSONS_PER_COURSE,
  publicLessonSchema,
  reorderLessonsRequestSchema,
  updateLessonRequestSchema,
} from "./lessons.js";

const valid = { title: "What is a candle?", idempotencyKey: "abcdefgh-1234" };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("create lesson", () => {
  it("accepts valid input, trims the title and applies defaults", () => {
    const l = createLessonRequestSchema.parse({ ...valid, title: "  Candles  " });
    expect(l).toMatchObject({ title: "Candles", body: "", isPreview: false });
  });

  it("accepts the limits and keeps newlines and tabs in the body", () => {
    expect(
      createLessonRequestSchema.safeParse({
        ...valid,
        title: "x".repeat(LESSON_TITLE_MAX),
        body: "line1\nline2\tend",
      }).success,
    ).toBe(true);
    expect(
      createLessonRequestSchema.safeParse({ ...valid, body: "y".repeat(LESSON_BODY_MAX) }).success,
    ).toBe(true);
  });

  it("rejects bad titles, bodies, keys and unknown fields", () => {
    const bad = [
      { ...valid, title: "" },
      { ...valid, title: "   " },
      { ...valid, title: "x".repeat(LESSON_TITLE_MAX + 1) },
      { ...valid, title: "two\nlines" },
      { ...valid, body: "y".repeat(LESSON_BODY_MAX + 1) },
      { ...valid, body: "bell\u0007" },
      { ...valid, body: "nul\u0000" },
      { ...valid, idempotencyKey: "short" },
      { ...valid, idempotencyKey: "k".repeat(101) },
      { title: valid.title },
      { ...valid, isPreview: "yes" },
      { ...valid, position: 1 },
    ];
    for (const b of bad)
      expect(createLessonRequestSchema.safeParse(b).success, JSON.stringify(b)).toBe(false);
  });

  it("keeps markup as typed text", () => {
    const l = createLessonRequestSchema.parse({ ...valid, body: "<script>alert(1)</script>" });
    expect(l.body).toBe("<script>alert(1)</script>");
  });
});

describe("update lesson", () => {
  it("needs a version and at least one change", () => {
    expect(updateLessonRequestSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(updateLessonRequestSchema.safeParse({ title: "New" }).success).toBe(false);
    expect(updateLessonRequestSchema.safeParse({ expectedVersion: 0, title: "New" }).success).toBe(
      false,
    );
    expect(
      updateLessonRequestSchema.safeParse({ expectedVersion: 2, isPreview: true }).success,
    ).toBe(true);
    expect(updateLessonRequestSchema.safeParse({ expectedVersion: 2, body: "" }).success).toBe(
      true,
    );
  });

  it("rejects an empty title and unknown fields", () => {
    expect(updateLessonRequestSchema.safeParse({ expectedVersion: 1, title: " " }).success).toBe(
      false,
    );
    expect(updateLessonRequestSchema.safeParse({ expectedVersion: 1, position: 3 }).success).toBe(
      false,
    );
  });
});

describe("reorder lessons", () => {
  it("accepts a list of unique ids", () => {
    expect(reorderLessonsRequestSchema.safeParse({ lessonIds: [id(1), id(2)] }).success).toBe(true);
  });

  it("rejects empty, duplicate, non-uuid and oversize lists", () => {
    expect(reorderLessonsRequestSchema.safeParse({ lessonIds: [] }).success).toBe(false);
    expect(reorderLessonsRequestSchema.safeParse({ lessonIds: [id(1), id(1)] }).success).toBe(
      false,
    );
    expect(reorderLessonsRequestSchema.safeParse({ lessonIds: ["nope"] }).success).toBe(false);
    const many = Array.from({ length: MAX_LESSONS_PER_COURSE + 1 }, (_, i) => id(i + 1));
    expect(reorderLessonsRequestSchema.safeParse({ lessonIds: many }).success).toBe(false);
  });
});

describe("public lesson", () => {
  it("carries no staff-only fields", () => {
    const l = publicLessonSchema.parse({
      id: "a",
      title: "t",
      position: 1,
      isPreview: true,
      body: "b",
      version: 3,
      createdBy: "someone",
    });
    expect(Object.keys(l).sort()).toEqual(["body", "id", "isPreview", "position", "title"]);
  });
});
