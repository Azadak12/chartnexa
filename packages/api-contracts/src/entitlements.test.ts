import { describe, expect, it } from "vitest";
import { publicCourseDetailSchema } from "./courses.js";
import {
  courseStudentSchema,
  entitlementPageQuerySchema,
  grantEntitlementRequestSchema,
  myCourseSchema,
  revokeEntitlementRequestSchema,
} from "./entitlements.js";

const uid = "00000000-0000-4000-8000-000000000001";

describe("grant and revoke requests", () => {
  it("accept a person id and a reason, trimming the reason", () => {
    expect(
      grantEntitlementRequestSchema.parse({ userId: uid, reason: "  Paid by invoice  " }),
    ).toEqual({ userId: uid, reason: "Paid by invoice" });
    expect(revokeEntitlementRequestSchema.parse({ reason: "Chargeback upheld" }).reason).toBe(
      "Chargeback upheld",
    );
  });

  it("reject short, long and missing reasons, bad ids and unknown fields", () => {
    const bad = [
      { userId: uid, reason: "ab" },
      { userId: uid, reason: "  ab  " },
      { userId: uid, reason: "x".repeat(201) },
      { userId: uid },
      { userId: "not-a-uuid", reason: "Valid reason" },
      { userId: uid, reason: "Valid reason", source: "stripe" },
    ];
    for (const b of bad)
      expect(grantEntitlementRequestSchema.safeParse(b).success, JSON.stringify(b)).toBe(false);
    expect(revokeEntitlementRequestSchema.safeParse({ reason: "ab" }).success).toBe(false);
    expect(revokeEntitlementRequestSchema.safeParse({}).success).toBe(false);
  });

  it("accepts the limits of a reason", () => {
    expect(grantEntitlementRequestSchema.safeParse({ userId: uid, reason: "abc" }).success).toBe(
      true,
    );
    expect(
      grantEntitlementRequestSchema.safeParse({ userId: uid, reason: "x".repeat(200) }).success,
    ).toBe(true);
  });
});

describe("responses", () => {
  it("my course carries public fields only", () => {
    const c = myCourseSchema.parse({
      id: "c",
      title: "t",
      summary: "s",
      level: "beginner",
      priceCents: 0,
      currency: "USD",
      coverTone: "blue",
      onSale: false,
      enrolledAt: "2026-11-18T00:00:00.000Z",
      status: "draft",
      version: 3,
    });
    expect(Object.keys(c).sort()).toEqual(
      [
        "coverTone",
        "currency",
        "enrolledAt",
        "id",
        "level",
        "onSale",
        "priceCents",
        "summary",
        "title",
      ].sort(),
    );
  });

  it("staff list item allows a missing name or email", () => {
    expect(
      courseStudentSchema.safeParse({
        id: "e",
        user: { id: "u", displayName: null, email: null },
        source: "admin_grant",
        grantReason: "Reason",
        createdAt: "2026-11-18T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("an older course detail without the new fields still parses with safe defaults", () => {
    const d = publicCourseDetailSchema.parse({
      id: "c",
      title: "t",
      description: "d",
      level: "beginner",
      priceCents: 0,
      currency: "USD",
      coverTone: "blue",
      publishedAt: "2026-11-18T00:00:00.000Z",
      lessonCount: 1,
      previewCount: 0,
    });
    expect(d).toMatchObject({ enrolled: false, onSale: true });
  });

  it("paging query caps the page size", () => {
    expect(entitlementPageQuerySchema.safeParse({ limit: "25" }).success).toBe(true);
    expect(entitlementPageQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(entitlementPageQuerySchema.safeParse({ extra: 1 }).success).toBe(false);
  });
});
