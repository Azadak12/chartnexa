import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  PERMISSION_HOLDERS,
  PERMISSION_SCOPES,
  permissionsForRole,
  type Role,
} from "./permissions.js";

describe("permission catalog", () => {
  it("gives Admin every permission", () => {
    expect(permissionsForRole("admin").sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("keeps role management, audit reading and full payments away from Managers", () => {
    const manager = permissionsForRole("manager");
    for (const p of ["roles:manage", "audit:read", "payments:read_full"] as const) {
      expect(manager).not.toContain(p);
    }
    expect(manager).toContain("payments:read_status");
    expect(manager).toContain("users:read");
  });

  it("gives Instructors nothing by default and Students only writing reviews", () => {
    expect(permissionsForRole("instructor")).toEqual([]);
    expect(permissionsForRole("student")).toEqual(["reviews:write"]);
  });

  it("keeps instructor_permissions:manage with Admins only", () => {
    expect(PERMISSION_HOLDERS["instructor_permissions:manage"]).toEqual(["admin"]);
  });

  it("has a holder decision and a scope for every catalog entry, and only known roles", () => {
    const roles: Role[] = ["student", "instructor", "manager", "admin"];
    for (const p of ALL_PERMISSIONS) {
      expect(PERMISSION_SCOPES[p]).toMatch(/^(global|course)$/);
      expect(Array.isArray(PERMISSION_HOLDERS[p])).toBe(true);
      expect(PERMISSION_HOLDERS[p]).toContain("admin");
      for (const r of PERMISSION_HOLDERS[p]) expect(roles).toContain(r);
    }
    expect(Object.keys(PERMISSION_HOLDERS).sort()).toEqual(Object.keys(PERMISSION_SCOPES).sort());
  });
});
