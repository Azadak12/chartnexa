import { describe, expect, it } from "vitest";
import {
  catalogQuerySchema,
  createCourseRequestSchema,
  PRICE_MAX_CENTS,
  publicCourseSchema,
  staffCourseSchema,
  updateCourseRequestSchema,
} from "./courses.js";

const valid = { title: "Price Action Basics", level: "beginner", priceCents: 4900 } as const;

describe("create course", () => {
  it("accepts valid details and applies defaults", () => {
    const c = createCourseRequestSchema.parse(valid);
    expect(c).toMatchObject({ description: "", coverTone: "blue", priceCents: 4900 });
  });

  it("rejects bad titles, levels, tones and prices", () => {
    const bad = [
      { ...valid, title: "ab" },
      { ...valid, title: "x".repeat(121) },
      { ...valid, level: "expert" },
      { ...valid, coverTone: "red" },
      { ...valid, priceCents: -1 },
      { ...valid, priceCents: 49.5 },
      { ...valid, priceCents: PRICE_MAX_CENTS + 1 },
      { ...valid, description: "x".repeat(5001) },
      { ...valid, extra: true },
    ];
    for (const b of bad)
      expect(createCourseRequestSchema.safeParse(b).success, JSON.stringify(b)).toBe(false);
    expect(createCourseRequestSchema.safeParse({ ...valid, priceCents: 0 }).success).toBe(true);
    expect(
      createCourseRequestSchema.safeParse({ ...valid, priceCents: PRICE_MAX_CENTS }).success,
    ).toBe(true);
  });
});

describe("update course", () => {
  it("needs the version and at least one change", () => {
    expect(updateCourseRequestSchema.safeParse({ title: "New title here" }).success).toBe(false);
    expect(updateCourseRequestSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(
      updateCourseRequestSchema.safeParse({ expectedVersion: 1, title: "New title here" }).success,
    ).toBe(true);
    expect(
      updateCourseRequestSchema.safeParse({ expectedVersion: 0, title: "New title here" }).success,
    ).toBe(false);
  });
});

describe("shapes", () => {
  it("public courses carry no staff-only fields", () => {
    const keys = Object.keys(publicCourseSchema.shape);
    for (const staff of ["status", "version", "createdBy", "createdAt", "updatedAt"])
      expect(keys).not.toContain(staff);
    expect(Object.keys(staffCourseSchema.shape)).toEqual(
      expect.arrayContaining(["status", "version"]),
    );
  });

  it("catalog queries cap the page size and reject unknown parameters", () => {
    expect(catalogQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(
      catalogQuerySchema.safeParse({ limit: "10", q: "price", level: "advanced" }).success,
    ).toBe(true);
    expect(catalogQuerySchema.safeParse({ level: "expert" }).success).toBe(false);
    expect(catalogQuerySchema.safeParse({ sort: "price" }).success).toBe(false);
  });
});
