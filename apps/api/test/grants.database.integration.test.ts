import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthorizationService, type Access } from "../src/modules/access/index.js";
import { GrantsService } from "../src/modules/access/grants/grants.service.js";
import { activeRole, person, revoke, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let admin: Person;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
  admin = await person(h, "admin");
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

const mkCourse = () =>
  h.db.course.create({ data: { title: "Constraint course", level: "beginner", priceCents: 0 } });
const row = (userId: string, over: Record<string, unknown> = {}) => ({
  userId,
  permission: "course:create",
  reason: "Direct insert",
  ...over,
});

describe("the database refuses bad grants on its own", () => {
  it("rejects non-grantable permissions, wrong scope and a second active grant", async () => {
    const ins = await person(h, "instructor");
    const c = await mkCourse();
    await expect(
      h.db.instructorGrant.create({
        data: row(ins.id, { permission: "roles:manage", courseId: c.id }),
      }),
    ).rejects.toThrow();
    await expect(
      h.db.instructorGrant.create({ data: row(ins.id, { permission: "course:update" }) }),
    ).rejects.toThrow();
    await expect(
      h.db.instructorGrant.create({
        data: row(ins.id, { permission: "course:create", courseId: c.id }),
      }),
    ).rejects.toThrow();
    await expect(
      h.db.instructorGrant.create({ data: row(ins.id, { reason: "ab" }) }),
    ).rejects.toThrow();
    await h.db.instructorGrant.create({ data: row(ins.id) });
    await expect(h.db.instructorGrant.create({ data: row(ins.id) })).rejects.toThrow();
  });

  it("allows the same grant again once the earlier one has ended", async () => {
    const ins = await person(h, "instructor");
    const first = await h.db.instructorGrant.create({ data: row(ins.id) });
    await h.db.instructorGrant.update({ where: { id: first.id }, data: { revokedAt: new Date() } });
    await h.db.instructorGrant.create({ data: row(ins.id) });
    expect(await h.db.instructorGrant.count({ where: { userId: ins.id } })).toBe(2);
  });
});

describe("the decision order", () => {
  const authz = new AuthorizationService(null as never);
  const access = (over: Partial<Access>): Access => ({
    userId: "u",
    roles: ["student", "instructor"],
    staffRole: "instructor",
    permissions: new Set(),
    grants: [],
    ...over,
  });
  it("role permission applies everywhere", () => {
    const a = access({ permissions: new Set(["course:update"]) });
    expect(authz.decide(a, "course:update", { courseId: "any" })).toBe(true);
    expect(authz.decide(a, "course:update")).toBe(true);
  });
  it("a course grant applies to its course only and to that permission only", () => {
    const a = access({ grants: [{ permission: "course:update", courseId: "A" }] });
    expect(authz.decide(a, "course:update", { courseId: "A" })).toBe(true);
    expect(authz.decide(a, "course:update", { courseId: "B" })).toBe(false);
    expect(authz.decide(a, "course:publish", { courseId: "A" })).toBe(false);
    expect(authz.decide(a, "course:update")).toBe(false);
  });
  it("anyCourse accepts a grant on any course, but only for that permission", () => {
    const a = access({ grants: [{ permission: "course:update", courseId: "A" }] });
    expect(authz.decide(a, "course:update", undefined, { anyCourse: true })).toBe(true);
    expect(authz.decide(a, "course:publish", undefined, { anyCourse: true })).toBe(false);
  });
  it("global-only permissions never come from course grants", () => {
    const a = access({ grants: [{ permission: "course:update", courseId: "A" }] });
    expect(authz.decide(a, "roles:manage", { courseId: "A" })).toBe(false);
  });
});

describe("reading access", () => {
  it("ignores stray grant rows of someone who is not an Instructor", async () => {
    const m = await person(h, "manager");
    const c = await mkCourse();
    await h.db.instructorGrant.create({
      data: row(m.id, { permission: "course:update", courseId: c.id }),
    });
    const authz = h.t.app.get(AuthorizationService);
    const a = await authz.access(m.id);
    expect(a.grants).toEqual([]);
    const s = await person(h);
    await h.db.instructorGrant.create({ data: row(s.id) });
    expect((await authz.access(s.id)).permissions.has("course:create")).toBe(false);
  });

  it("reads grants with one extra query for Instructors and none for others", async () => {
    const authz = h.t.app.get(AuthorizationService);
    const spy = vi.spyOn(h.db.instructorGrant, "findMany");
    const ins = await person(h, "instructor");
    const stu = await person(h);
    await authz.access(stu.id);
    expect(spy).not.toHaveBeenCalled();
    await authz.access(ins.id);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("role changes are all or nothing", () => {
  it("leaves the role and grants untouched when ending grants fails", async () => {
    const ins = await person(h, "instructor");
    await h.db.instructorGrant.create({ data: row(ins.id) });
    const grants = h.t.app.get(GrantsService);
    const spy = vi.spyOn(grants, "endAllForUser").mockRejectedValueOnce(new Error("boom"));
    const res = await revoke(h, admin, ins.id);
    expect(res.statusCode).toBe(500);
    spy.mockRestore();
    expect(await activeRole(h, ins.id)).toBe("instructor");
    expect(await h.db.instructorGrant.count({ where: { userId: ins.id, revokedAt: null } })).toBe(
      1,
    );
  });
});
