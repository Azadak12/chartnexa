import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  Category,
  Page,
  PublicCourseSummary,
  StaffCategory,
  StaffCourse,
} from "@chartnexa/api-contracts";
import { CoursesService } from "../src/modules/courses/index.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let admin: Person;
let manager: Person;
let student: Person;
let instructor: Person;
let svc: CoursesService;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
  svc = h.t.app.get(CoursesService);
  admin = await person(h, "admin");
  manager = await person(h, "manager");
  student = await person(h);
  instructor = await person(h, "instructor");
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

type M = "GET" | "POST" | "PATCH" | "DELETE";
const call = (p: Person | undefined, method: M, url: string, body?: unknown) =>
  h.call(method, url, {
    ...(p ? { token: p.accessToken } : {}),
    ...(body !== undefined ? { body } : {}),
  });
let n = 0;
const uniq = (base = "Cat") => `${base} ${++n}`;
const mkCat = async (name = uniq()) =>
  (await call(manager, "POST", "/staff/categories", { name })).json() as StaffCategory;
const valid = {
  title: "Category course",
  description: "A complete description",
  level: "beginner",
  priceCents: 0,
  coverTone: "blue",
} as const;
const mkCourse = async (categoryId: string | null, publish = true) => {
  const c = await svc.create(admin.id, { ...valid, categoryId } as never, "rq");
  return publish ? svc.publish(admin.id, c.id, "rp") : c;
};
const staffList = async () =>
  ((await call(manager, "GET", "/staff/categories")).json() as { items: StaffCategory[] }).items;

describe("creating categories", () => {
  it("lets Admins and Managers add one, audited", async () => {
    for (const who of [admin, manager]) {
      const name = uniq("Forex");
      const res = await call(who, "POST", "/staff/categories", { name: `  ${name} ` });
      expect(res.statusCode).toBe(200);
      const c = res.json() as StaffCategory;
      expect(c).toMatchObject({ name, courseCount: 0, totalCourseCount: 0, version: 1 });
      const audit = await auditRows(h, { action: "category.create", targetId: c.id });
      expect(audit).toHaveLength(1);
      expect(audit[0]!.actorUserId).toBe(who.id);
    }
  });

  it("refuses Students, Instructors and signed-out callers", async () => {
    for (const who of [student, instructor]) {
      expect((await call(who, "POST", "/staff/categories", { name: uniq() })).statusCode).toBe(403);
      expect((await call(who, "GET", "/staff/categories")).statusCode).toBe(403);
    }
    expect((await call(undefined, "POST", "/staff/categories", { name: uniq() })).statusCode).toBe(
      401,
    );
  });

  it("names bad input and rejects a name that differs only in case", async () => {
    const taken = await mkCat(uniq("Crypto"));
    for (const body of [
      {},
      { name: "x" },
      { name: "x".repeat(41) },
      { name: "bad\u0007name" },
      { name: taken.name.toUpperCase() },
      { name: "Fine", extra: 1 },
    ]) {
      const res = await call(manager, "POST", "/staff/categories", body);
      expect(res.statusCode).toBe(400);
    }
    const dup = await call(manager, "POST", "/staff/categories", {
      name: taken.name.toLowerCase(),
    });
    expect((dup.json() as { fields: { field: string; message: string }[] }).fields).toEqual([
      { field: "name", message: "A category with this name already exists" },
    ]);
  });

  it("keeps one category when the same name is sent many times at once", async () => {
    const name = uniq("Options");
    const res = await Promise.all(
      Array.from({ length: 6 }, () => call(manager, "POST", "/staff/categories", { name })),
    );
    expect(res.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(res.filter((r) => r.statusCode === 400)).toHaveLength(5);
    expect(await h.db.category.count({ where: { name } })).toBe(1);
  });

  it("stops at 50 categories, even when created at once", async () => {
    const db = await createIsolatedDb();
    const hh = await makeHarness(db.url);
    try {
      const m = await person(hh, "manager");
      await hh.db.category.createMany({
        data: Array.from({ length: 48 }, (_, i) => ({ name: `Seed ${i}` })),
      });
      const res = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          hh.call("POST", "/staff/categories", {
            token: m.accessToken,
            body: { name: `Late ${i}` },
          }),
        ),
      );
      expect(res.filter((r) => r.statusCode === 200)).toHaveLength(2);
      expect(res.filter((r) => r.statusCode === 409)).toHaveLength(3);
      expect(await hh.db.category.count()).toBe(50);
    } finally {
      await hh.t.app.close();
      await db.drop();
    }
  });
});

describe("renaming and deleting", () => {
  it("renames with the current version, refuses a stale one and a taken name", async () => {
    const a = await mkCat();
    const b = await mkCat();
    const renamed = await call(manager, "PATCH", `/staff/categories/${a.id}`, {
      expectedVersion: 1,
      name: "Renamed One",
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ name: "Renamed One", version: 2 });
    expect(
      (
        await call(manager, "PATCH", `/staff/categories/${a.id}`, {
          expectedVersion: 1,
          name: "Again",
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call(manager, "PATCH", `/staff/categories/${a.id}`, {
          expectedVersion: 2,
          name: b.name,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call(manager, "PATCH", "/staff/categories/00000000-0000-4000-8000-000000000001", {
          expectedVersion: 1,
          name: "Nope",
        })
      ).statusCode,
    ).toBe(404);
    const audit = await auditRows(h, { action: "category.rename", targetId: a.id });
    expect(audit).toHaveLength(1);
  });

  it("lets only one of two simultaneous renames from the same version win", async () => {
    const a = await mkCat();
    const res = await Promise.all([
      call(manager, "PATCH", `/staff/categories/${a.id}`, {
        expectedVersion: 1,
        name: uniq("Left"),
      }),
      call(admin, "PATCH", `/staff/categories/${a.id}`, {
        expectedVersion: 1,
        name: uniq("Right"),
      }),
    ]);
    expect(res.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });

  it("refuses to delete a category in use, deletes an unused one, and a repeat still succeeds", async () => {
    const used = await mkCat();
    await mkCourse(used.id, false);
    const refused = await call(manager, "DELETE", `/staff/categories/${used.id}`);
    expect(refused.statusCode).toBe(409);
    expect((refused.json() as { message: string }).message).toContain("1 course");
    const free = await mkCat();
    expect((await call(manager, "DELETE", `/staff/categories/${free.id}`)).json()).toEqual({
      deleted: true,
    });
    expect((await call(manager, "DELETE", `/staff/categories/${free.id}`)).json()).toEqual({
      deleted: false,
    });
    expect(await auditRows(h, { action: "category.delete", targetId: free.id })).toHaveLength(1);
  });

  it("never leaves a course pointing at a deleted category when delete and assign race", async () => {
    for (let i = 0; i < 6; i++) {
      const cat = await mkCat();
      const course = await mkCourse(null, false);
      const [del, assign] = await Promise.all([
        call(manager, "DELETE", `/staff/categories/${cat.id}`),
        call(admin, "PATCH", `/staff/courses/${course.id}`, {
          expectedVersion: course.version,
          categoryId: cat.id,
        }),
      ]);
      const row = await h.db.course.findUniqueOrThrow({ where: { id: course.id } });
      const exists = (await h.db.category.count({ where: { id: cat.id } })) === 1;
      if (row.categoryId) expect(exists).toBe(true);
      expect([del.statusCode, assign.statusCode]).not.toContain(500);
    }
  });
});

describe("courses and the catalog", () => {
  it("assign, change and remove a course's category, rejecting unknown ones", async () => {
    const a = await mkCat();
    const b = await mkCat();
    const created = await call(admin, "POST", "/staff/courses", { ...valid, categoryId: a.id });
    expect(created.statusCode).toBe(201);
    const c = created.json() as StaffCourse;
    expect(c.categoryId).toBe(a.id);
    const unknown = await call(admin, "POST", "/staff/courses", {
      ...valid,
      categoryId: "00000000-0000-4000-8000-000000000002",
    });
    expect(unknown.statusCode).toBe(400);
    expect((unknown.json() as { fields: { field: string }[] }).fields[0]!.field).toBe("categoryId");
    const moved = await call(admin, "PATCH", `/staff/courses/${c.id}`, {
      expectedVersion: c.version,
      categoryId: b.id,
    });
    expect((moved.json() as StaffCourse).categoryId).toBe(b.id);
    const audit = await auditRows(h, { action: "course.update", targetId: c.id });
    expect(audit.at(-1)!.after).toMatchObject({ categoryId: b.id });
    const cleared = await call(admin, "PATCH", `/staff/courses/${c.id}`, {
      expectedVersion: (moved.json() as StaffCourse).version,
      categoryId: null,
    });
    expect((cleared.json() as StaffCourse).categoryId).toBeNull();
    expect(
      (
        await call(admin, "PATCH", `/staff/courses/${c.id}`, {
          expectedVersion: 99,
          categoryId: "nope",
        })
      ).statusCode,
    ).toBe(400);
  });

  it("filter the catalog by category and count published courses only", async () => {
    const cat = await mkCat(uniq("Zeta"));
    const other = await mkCat(uniq("alpha"));
    const p1 = await mkCourse(cat.id);
    const p2 = await mkCourse(cat.id);
    await mkCourse(cat.id, false); // draft
    await mkCourse(other.id);
    const page = (
      await call(undefined, "GET", `/courses?category=${cat.id}&limit=1`)
    ).json() as Page<PublicCourseSummary>;
    expect(page.items).toHaveLength(1);
    const next = (
      await call(
        undefined,
        "GET",
        `/courses?category=${cat.id}&limit=1&cursor=${encodeURIComponent(page.nextCursor!)}`,
      )
    ).json() as Page<PublicCourseSummary>;
    expect([page.items[0]!.id, next.items[0]!.id].sort()).toEqual([p1.id, p2.id].sort());
    expect(next.nextCursor).toBeNull();
    for (const item of [...page.items, ...next.items]) expect(item.categoryId).toBe(cat.id);
    expect((await call(undefined, "GET", "/courses?category=not-a-uuid")).statusCode).toBe(400);
    const pub = ((await call(undefined, "GET", "/categories")).json() as { items: Category[] })
      .items;
    expect(pub.find((c) => c.id === cat.id)).toEqual({
      id: cat.id,
      name: cat.name,
      courseCount: 2,
    });
    // Name order ignores case.
    const names = pub.map((c) => c.name);
    expect([...names].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase()))).toEqual(
      names,
    );
    const st = (await staffList()).find((c) => c.id === cat.id)!;
    expect([st.courseCount, st.totalCourseCount]).toEqual([2, 3]);
    expect((await call(undefined, "GET", `/courses/${p1.id}`)).json()).toMatchObject({
      categoryId: cat.id,
    });
  });
});
