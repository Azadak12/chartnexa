import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { errorEnvelopeSchema } from "@chartnexa/api-contracts";
import { PrismaService } from "../src/database/prisma.service.js";
import { AuthorizationService } from "../src/modules/access/index.js";
import { permissionsForRole } from "../src/modules/access/index.js";
import { assign, auditRows, person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await makeHarness(inject("dbUrl"));
});
afterAll(async () => {
  await h.t.app.close();
});

const probe = (token?: string) =>
  h.call("GET", "/test/needs-course-update?courseId=course-1", token ? { token } : {});

describe("server-side permission checks", () => {
  it("answers 401 when not signed in and 403 FORBIDDEN without the permission", async () => {
    expect((await probe()).statusCode).toBe(401);
    for (const role of [undefined, "instructor"] as const) {
      const p = await person(h, role);
      const res = await probe(p.accessToken);
      expect(res.statusCode).toBe(403);
      expect(errorEnvelopeSchema.parse(res.json()).code).toBe("FORBIDDEN");
    }
  });

  it("applies role defaults to any resource", async () => {
    const manager = await person(h, "manager");
    const admin = await person(h, "admin");
    expect((await probe(manager.accessToken)).statusCode).toBe(200);
    expect((await probe(admin.accessToken)).statusCode).toBe(200);
  });

  it("gives disabled and deleted accounts no access", async () => {
    const authz = h.t.app.get(AuthorizationService);
    const disabled = await person(h, "admin");
    await h.db.user.update({ where: { id: disabled.id }, data: { status: "disabled" } });
    const access = await authz.access(disabled.id);
    expect(access.roles).toEqual([]);
    expect(access.permissions.size).toBe(0);
    expect(await authz.can(disabled.id, "roles:manage")).toBe(false);
    const gone = await person(h, "manager");
    await h.call("DELETE", "/me", { token: gone.accessToken, body: { password: gone.password } });
    expect((await authz.access(gone.id)).permissions.size).toBe(0);
    expect((await authz.access("11111111-1111-4111-8111-111111111111")).roles).toEqual([]);
  });

  it("require() throws a 403 and decide() honours the resource argument", async () => {
    const authz = h.t.app.get(AuthorizationService);
    const instructor = await person(h, "instructor");
    await expect(
      authz.require(instructor.id, "course:update", { courseId: "c1" }),
    ).rejects.toMatchObject({ status: 403 });
    const manager = await person(h, "manager");
    await expect(
      authz.require(manager.id, "course:update", { courseId: "c1" }),
    ).resolves.toBeUndefined();
    await expect(authz.require(manager.id, "roles:manage")).rejects.toMatchObject({ status: 403 });
  });

  it("reads the database once per request however many checks run", async () => {
    const authz = h.t.app.get(AuthorizationService);
    const db = h.t.app.get(PrismaService);
    const manager = await person(h, "manager");
    const spy = vi.spyOn(db.user, "findUnique");
    const req = {} as never;
    await Promise.all([
      authz.accessForRequest(req, manager.id),
      authz.accessForRequest(req, manager.id),
      authz.accessForRequest(req, manager.id),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("denial logging and audit", () => {
  it("only logs a denial on an unannotated route, but audits one on role management", async () => {
    const student = await person(h);
    const before = (await auditRows(h, { actorUserId: student.id })).length;
    await probe(student.accessToken);
    expect(h.t.logs()).toContain("authz.denied");
    expect((await auditRows(h, { actorUserId: student.id })).length).toBe(before);

    const target = await person(h);
    await assign(h, student, target.id, "manager");
    const after = await auditRows(h, { actorUserId: student.id });
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)).toMatchObject({
      action: "role.assign",
      outcome: "denied",
      reason: "missing_permission",
    });
  });
});

describe("own access and staff lookup", () => {
  it("lists only the caller's roles and permissions", async () => {
    const student = await person(h);
    const manager = await person(h, "manager");
    const a = (await h.call("GET", "/me/access", { token: student.accessToken })).json();
    expect(a).toEqual({ roles: ["student"], permissions: [] });
    const m = (await h.call("GET", "/me/access", { token: manager.accessToken })).json();
    expect(m.roles).toEqual(["student", "manager"]);
    expect(m.permissions).toEqual(permissionsForRole("manager").sort());
    expect(m.permissions).toContain("payments:read_status");
    expect(m.permissions).not.toContain("payments:read_full");
    expect((await h.call("GET", "/me/access")).statusCode).toBe(401);
  });

  it("finds only an exact email and returns only id, name, role and status", async () => {
    const manager = await person(h, "manager");
    const target = await person(h, "instructor");
    const q = (email: string, token = manager.accessToken) =>
      h.call("GET", `/staff/users/lookup?email=${encodeURIComponent(email)}`, { token });
    const hit = await q(target.email.toLowerCase());
    expect(hit.statusCode).toBe(200);
    expect(Object.keys(hit.json()).sort()).toEqual(["displayName", "id", "staffRole", "status"]);
    expect(hit.json()).toMatchObject({ id: target.id, staffRole: "instructor", status: "active" });
    expect(hit.body).not.toMatch(/password|hash|token|session/i);

    const local = target.email.toLowerCase().split("@")[0] as string;
    for (const fragment of [local, `${local}@example`, `${local}@example.co`, "%"]) {
      const res = await q(fragment);
      expect([400, 404], fragment).toContain(res.statusCode);
      expect(res.body).not.toContain(target.id);
    }
    expect((await q("nobody-here@example.com")).statusCode).toBe(404);
  });

  it("denies lookup for Instructors and Students", async () => {
    const target = await person(h);
    for (const role of [undefined, "instructor"] as const) {
      const p = await person(h, role);
      const res = await h.call(
        "GET",
        `/staff/users/lookup?email=${encodeURIComponent(target.email.toLowerCase())}`,
        { token: p.accessToken },
      );
      expect(res.statusCode).toBe(403);
    }
  });
});
