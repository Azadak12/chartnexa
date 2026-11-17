import { describe, expect, it } from "vitest";
import {
  assignRoleRequestSchema,
  lookupQuerySchema,
  revokeRoleRequestSchema,
  REASON_MAX,
  REASON_MIN,
} from "./access.js";

describe("role request schemas", () => {
  it("accepts a valid assignment and trims the reason", () => {
    const r = assignRoleRequestSchema.parse({ role: "manager", reason: "  Joins ops team  " });
    expect(r).toEqual({ role: "manager", reason: "Joins ops team" });
  });

  it("enforces the reason bounds", () => {
    const base = { role: "instructor" } as const;
    expect(assignRoleRequestSchema.safeParse({ ...base }).success).toBe(false);
    expect(assignRoleRequestSchema.safeParse({ ...base, reason: "ab" }).success).toBe(false);
    expect(
      assignRoleRequestSchema.safeParse({ ...base, reason: "x".repeat(REASON_MIN) }).success,
    ).toBe(true);
    expect(
      assignRoleRequestSchema.safeParse({ ...base, reason: "x".repeat(REASON_MAX) }).success,
    ).toBe(true);
    expect(
      assignRoleRequestSchema.safeParse({ ...base, reason: "x".repeat(REASON_MAX + 1) }).success,
    ).toBe(false);
    expect(revokeRoleRequestSchema.safeParse({ reason: "  " }).success).toBe(false);
  });

  it("rejects unknown roles (including student) and extra properties", () => {
    expect(
      assignRoleRequestSchema.safeParse({ role: "student", reason: "valid reason" }).success,
    ).toBe(false);
    expect(
      assignRoleRequestSchema.safeParse({ role: "root", reason: "valid reason" }).success,
    ).toBe(false);
    expect(
      assignRoleRequestSchema.safeParse({ role: "admin", reason: "valid reason", userId: "x" })
        .success,
    ).toBe(false);
  });

  it("requires a complete email for lookup", () => {
    expect(lookupQuerySchema.parse({ email: " Ann@Example.com " }).email).toBe("ann@example.com");
    expect(lookupQuerySchema.safeParse({ email: "ann" }).success).toBe(false);
    expect(lookupQuerySchema.safeParse({ email: "ann@exa" }).success).toBe(false);
  });
});
