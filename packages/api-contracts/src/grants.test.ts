import { describe, expect, it } from "vitest";
import { accessResponseSchema } from "./access.js";
import { GRANTABLE_LIST, grantRequestSchema, revokeGrantRequestSchema } from "./grants.js";

const course = "5b1c1a6e-3b7a-4a0c-9d3e-2f1a6b8c9d01";
const fields = (r: ReturnType<typeof grantRequestSchema.safeParse>) =>
  r.success ? [] : r.error.issues.map((i) => i.path.join("."));

describe("grant requests", () => {
  it("accepts a course permission with a course and a reason", () => {
    expect(
      grantRequestSchema.safeParse({
        permission: "course:update",
        courseId: course,
        reason: "Teaches it",
      }).success,
    ).toBe(true);
  });
  it("accepts create-course without a course", () => {
    expect(
      grantRequestSchema.safeParse({ permission: "course:create", reason: "Trusted author" })
        .success,
    ).toBe(true);
  });
  it("requires a course for course permissions", () => {
    const r = grantRequestSchema.safeParse({ permission: "course:publish", reason: "Ok then" });
    expect(fields(r)).toEqual(["courseId"]);
  });
  it("refuses a course on create-course", () => {
    const r = grantRequestSchema.safeParse({
      permission: "course:create",
      courseId: course,
      reason: "Ok then",
    });
    expect(fields(r)).toEqual(["courseId"]);
  });
  it("refuses permissions that are not grantable", () => {
    for (const permission of [
      "roles:manage",
      "audit:read",
      "users:read",
      "instructor_permissions:manage",
      "enrollments:manage",
      "reviews:moderate",
      "payments:read_full",
      "nonsense",
    ]) {
      expect(
        grantRequestSchema.safeParse({ permission, courseId: course, reason: "Nope" }).success,
      ).toBe(false);
    }
  });
  it("bounds the reason and trims it", () => {
    const base = { permission: "course:create" };
    expect(grantRequestSchema.safeParse({ ...base, reason: "ab" }).success).toBe(false);
    expect(grantRequestSchema.safeParse({ ...base, reason: "x".repeat(201) }).success).toBe(false);
    expect(grantRequestSchema.safeParse({ ...base, reason: "   " }).success).toBe(false);
    const ok = grantRequestSchema.parse({ ...base, reason: "  fine  " });
    expect(ok.reason).toBe("fine");
  });
  it("rejects unknown fields", () => {
    expect(
      grantRequestSchema.safeParse({ permission: "course:create", reason: "fine", extra: 1 })
        .success,
    ).toBe(false);
  });
  it("lists exactly the seven grantable permissions", () => {
    expect(GRANTABLE_LIST).toHaveLength(7);
  });
  it("needs a reason to revoke", () => {
    expect(revokeGrantRequestSchema.safeParse({}).success).toBe(false);
    expect(revokeGrantRequestSchema.safeParse({ reason: "No longer needed" }).success).toBe(true);
  });
});

describe("access response", () => {
  it("still parses an older response without course grants", () => {
    const r = accessResponseSchema.parse({ roles: ["student"], permissions: [] });
    expect(r.courseGrants).toEqual([]);
  });
});
