import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  errorEnvelopeSchema,
  type Page,
  type PublicCourseSummary,
  type StaffCourse,
} from "@chartnexa/api-contracts";
import { CoursesService } from "../src/modules/courses/index.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, stripRequestId, type Harness } from "./auth-helpers.js";
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

const valid = {
  title: "Price Action Basics",
  description: "Learn to read charts.",
  level: "beginner",
  priceCents: 4900,
  coverTone: "blue",
} as const;
const make = async (over: Record<string, unknown> = {}, publish = false) => {
  const c = await svc.create(admin.id, { ...valid, ...over } as never, "test-request-1");
  return publish ? svc.publish(admin.id, c.id, "test-request-2") : c;
};
const staff = (p: Person, method: "GET" | "POST" | "PATCH", url: string, body?: unknown) =>
  h.call(method, url, { token: p.accessToken, ...(body !== undefined ? { body } : {}) });

describe("creating courses", () => {
  it("lets an Admin and a Manager create a draft and audits it", async () => {
    for (const who of [admin, manager]) {
      const res = await staff(who, "POST", "/staff/courses", valid);
      expect(res.statusCode).toBe(201);
      const c = res.json() as StaffCourse;
      expect(c).toMatchObject({
        status: "draft",
        version: 1,
        title: valid.title,
        currency: "USD",
        priceCents: 4900,
        publishedAt: null,
      });
      const rows = await auditRows(h, { targetId: c.id });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: "course.create",
        actorUserId: who.id,
        outcome: "success",
      });
    }
  });

  it("is not visible to students while it is a draft", async () => {
    const c = await make({ title: "Hidden draft course" });
    const list = (await h.call("GET", "/courses?limit=100")).json() as Page<PublicCourseSummary>;
    expect(list.items.map((i) => i.id)).not.toContain(c.id);
  });

  it("rejects invalid details with field errors and creates nothing", async () => {
    const before = await h.db.course.count();
    const bad = [
      { ...valid, title: "ab" },
      { ...valid, title: "x".repeat(121) },
      { ...valid, description: "x".repeat(5001) },
      { ...valid, level: "expert" },
      { ...valid, coverTone: "red" },
      { ...valid, priceCents: -5 },
      { ...valid, priceCents: 49.5 },
      { ...valid, priceCents: 1_000_001 },
    ];
    for (const b of bad) {
      const res = await staff(admin, "POST", "/staff/courses", b);
      expect(res.statusCode, JSON.stringify(b).slice(0, 60)).toBe(400);
      expect((errorEnvelopeSchema.parse(res.json()).fields ?? []).length).toBeGreaterThan(0);
    }
    expect(await h.db.course.count()).toBe(before);
  });

  it("refuses students, instructors without a permission, and signed-out callers", async () => {
    expect((await staff(student, "POST", "/staff/courses", valid)).statusCode).toBe(403);
    expect((await staff(instructor, "POST", "/staff/courses", valid)).statusCode).toBe(403);
    expect((await h.call("POST", "/staff/courses", { body: valid })).statusCode).toBe(401);
  });

  it("has database constraints that refuse invalid values even if the API were bypassed", async () => {
    const row = { title: "Valid title", level: "beginner" as const, coverTone: "blue" as const };
    await expect(h.db.course.create({ data: { ...row, priceCents: -1 } })).rejects.toThrow();
    await expect(h.db.course.create({ data: { ...row, priceCents: 2_000_000 } })).rejects.toThrow();
    await expect(
      h.db.course.create({ data: { ...row, title: "ab", priceCents: 100 } }),
    ).rejects.toThrow();
    await expect(
      h.db.course.create({ data: { ...row, priceCents: 100, status: "published" } }),
    ).rejects.toThrow();
  });
});

describe("editing without overwriting others", () => {
  it("updates, bumps the version and audits before and after", async () => {
    const c = await make();
    const res = await staff(manager, "PATCH", `/staff/courses/${c.id}`, {
      expectedVersion: 1,
      title: "Price Action Mastery",
      priceCents: 5900,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      version: 2,
      title: "Price Action Mastery",
      priceCents: 5900,
    });
    const rows = await auditRows(h, { targetId: c.id, action: "course.update" });
    expect(rows[0]).toMatchObject({
      before: { title: valid.title, priceCents: 4900 },
      after: { title: "Price Action Mastery", priceCents: 5900 },
    });
  });

  it("refuses an edit based on an older version", async () => {
    const c = await make();
    await staff(admin, "PATCH", `/staff/courses/${c.id}`, {
      expectedVersion: 1,
      title: "First edit here",
    });
    const stale = await staff(manager, "PATCH", `/staff/courses/${c.id}`, {
      expectedVersion: 1,
      title: "Second editor here",
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().message).toMatch(/changed by someone else/);
    expect((await svc.getForStaff(c.id)).title).toBe("First edit here");
  });

  it("lets exactly one of two simultaneous edits win", async () => {
    for (let i = 0; i < 8; i++) {
      const c = await make();
      const [a, b] = await Promise.all([
        staff(admin, "PATCH", `/staff/courses/${c.id}`, {
          expectedVersion: 1,
          title: "Edit from admin",
        }),
        staff(manager, "PATCH", `/staff/courses/${c.id}`, {
          expectedVersion: 1,
          title: "Edit from manager",
        }),
      ]);
      expect([a.statusCode, b.statusCode].sort(), `round ${i}`).toEqual([200, 409]);
      expect((await svc.getForStaff(c.id)).version).toBe(2);
    }
  });

  it("returns the course unchanged when nothing differs, and validates input", async () => {
    const c = await make();
    const same = await staff(admin, "PATCH", `/staff/courses/${c.id}`, {
      expectedVersion: 1,
      title: valid.title,
    });
    expect(same.statusCode).toBe(200);
    expect(same.json().version).toBe(1);
    expect(
      (await staff(admin, "PATCH", `/staff/courses/${c.id}`, { expectedVersion: 1 })).statusCode,
    ).toBe(400);
    expect(
      (await staff(admin, "PATCH", `/staff/courses/${c.id}`, { title: "No version here" }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await staff(admin, "PATCH", `/staff/courses/${c.id}`, {
          expectedVersion: 1,
          priceCents: 0.5,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await staff(admin, "PATCH", "/staff/courses/11111111-1111-4111-8111-111111111111", {
          expectedVersion: 1,
          title: "Nope nope",
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await staff(admin, "PATCH", "/staff/courses/not-a-uuid", {
          expectedVersion: 1,
          title: "Nope nope",
        })
      ).statusCode,
    ).toBe(400);
  });

  it("refuses students and instructors", async () => {
    const c = await make();
    for (const who of [student, instructor]) {
      expect(
        (
          await staff(who, "PATCH", `/staff/courses/${c.id}`, {
            expectedVersion: 1,
            title: "Not allowed",
          })
        ).statusCode,
      ).toBe(403);
    }
  });
});

describe("publishing", () => {
  it("publishes a complete draft, shows it publicly, and audits it", async () => {
    const c = await make({ title: "Publish me please" });
    const res = await staff(manager, "POST", `/staff/courses/${c.id}/publish`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "published", version: 2 });
    expect(res.json().publishedAt).toBeTruthy();
    const pub = await h.call("GET", `/courses/${c.id}`);
    expect(pub.statusCode).toBe(200);
    expect((await auditRows(h, { targetId: c.id, action: "course.publish" }))[0]).toMatchObject({
      before: { status: "draft" },
      after: { status: "published" },
    });
  });

  it("refuses an incomplete draft with a field reason and keeps it a draft", async () => {
    const c = await make({ title: "Missing description", description: "" });
    const res = await staff(admin, "POST", `/staff/courses/${c.id}/publish`);
    expect(res.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(res.json()).fields?.[0]?.field).toBe("description");
    expect((await svc.getForStaff(c.id)).status).toBe("draft");
  });

  it("answers 409 for publishing twice or unpublishing a draft", async () => {
    const c = await make({ title: "Twice published" }, true);
    expect((await staff(admin, "POST", `/staff/courses/${c.id}/publish`)).statusCode).toBe(409);
    const d = await make({ title: "Still a draft" });
    expect((await staff(admin, "POST", `/staff/courses/${d.id}/unpublish`)).statusCode).toBe(409);
  });

  it("unpublishes: back to draft and gone from the public catalog at once", async () => {
    const c = await make({ title: "Soon unpublished" }, true);
    expect((await h.call("GET", `/courses/${c.id}`)).statusCode).toBe(200);
    const res = await staff(admin, "POST", `/staff/courses/${c.id}/unpublish`);
    expect(res.json()).toMatchObject({ status: "draft", publishedAt: null });
    expect((await h.call("GET", `/courses/${c.id}`)).statusCode).toBe(404);
    const list = (await h.call("GET", "/courses?limit=100")).json() as Page<PublicCourseSummary>;
    expect(list.items.map((i) => i.id)).not.toContain(c.id);
    expect((await auditRows(h, { targetId: c.id, action: "course.unpublish" })).length).toBe(1);
  });

  it("refuses students, instructors and signed-out callers", async () => {
    const c = await make({ title: "Locked course" });
    for (const who of [student, instructor]) {
      expect((await staff(who, "POST", `/staff/courses/${c.id}/publish`)).statusCode).toBe(403);
    }
    expect((await h.call("POST", `/staff/courses/${c.id}/publish`)).statusCode).toBe(401);
  });
});

describe("staff list", () => {
  it("shows drafts and published courses, filters by status and pages newest change first", async () => {
    const a = await make({ title: "List course A" });
    const b = await make({ title: "List course B" }, true);
    const all = (
      await staff(manager, "GET", "/staff/courses?limit=100")
    ).json() as Page<StaffCourse>;
    const ids = all.items.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
    const times = all.items.map((i) => i.updatedAt);
    expect([...times].sort().reverse()).toEqual(times);
    const drafts = (
      await staff(manager, "GET", "/staff/courses?status=draft&limit=100")
    ).json() as Page<StaffCourse>;
    expect(drafts.items.every((i) => i.status === "draft")).toBe(true);
    const pubs = (
      await staff(manager, "GET", "/staff/courses?status=published&limit=100")
    ).json() as Page<StaffCourse>;
    expect(pubs.items.every((i) => i.status === "published")).toBe(true);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = (
        await staff(
          manager,
          "GET",
          `/staff/courses?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        )
      ).json() as Page<StaffCourse>;
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(await h.db.course.count());
  });

  it("opens any course for staff and refuses students and instructors", async () => {
    const c = await make({ title: "Staff only draft" });
    expect((await staff(admin, "GET", `/staff/courses/${c.id}`)).json().status).toBe("draft");
    for (const who of [student, instructor]) {
      expect((await staff(who, "GET", "/staff/courses")).statusCode).toBe(403);
      expect((await staff(who, "GET", `/staff/courses/${c.id}`)).statusCode).toBe(403);
    }
    expect(
      (await staff(admin, "GET", "/staff/courses/11111111-1111-4111-8111-111111111111")).statusCode,
    ).toBe(404);
  });
});

describe("public catalog", () => {
  it("lists only published courses, newest published first, with no staff-only fields", async () => {
    const first = await make({ title: "Catalog first" }, true);
    await new Promise((r) => setTimeout(r, 5));
    const second = await make({ title: "Catalog second" }, true);
    const res = await h.call("GET", "/courses?limit=100");
    expect(res.statusCode).toBe(200);
    const list = res.json() as Page<PublicCourseSummary>;
    const ids = list.items.map((i) => i.id);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
    for (const item of list.items) {
      expect(Object.keys(item)).not.toEqual(expect.arrayContaining(["status"]));
      expect(item).not.toHaveProperty("version");
      expect(item).not.toHaveProperty("description");
      expect(item.currency).toBe("USD");
    }
    expect(h.db.course.count({ where: { status: "draft" } })).resolves.toBeGreaterThan(0);
  });

  it("pages without duplicates or gaps even when courses are published in between", async () => {
    for (let i = 0; i < 7; i++) await make({ title: `Paging course ${i}` }, true);
    const total = await h.db.course.count({ where: { status: "published" } });
    const seen: string[] = [];
    let cursor: string | null = null;
    let round = 0;
    do {
      const page = (
        await h.call(
          "GET",
          `/courses?limit=4${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        )
      ).json() as Page<PublicCourseSummary>;
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
      if (round++ === 0) await make({ title: "Published mid paging" }, true); // newer, so it sorts before page one
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(total);
  });

  it("rejects a tampered cursor, a too-large limit and unknown parameters", async () => {
    for (const q of [
      "?cursor=tampered.value",
      "?limit=101",
      "?limit=0",
      "?level=expert",
      "?sort=price",
    ]) {
      const res = await h.call("GET", `/courses${q}`);
      expect(res.statusCode, q).toBe(400);
      expect(errorEnvelopeSchema.parse(res.json()).requestId).toBeTruthy();
    }
  });

  it("searches titles in any letter case, filters by level, and treats special characters literally", async () => {
    await make({ title: "Options Greeks Explained", level: "advanced" }, true);
    await make({ title: "Options for Beginners", level: "beginner" }, true);
    await make({ title: "100% Risk_Free? It's a trap", level: "intermediate" }, true);
    const titles = async (q: string) =>
      (
        (await h.call("GET", `/courses?limit=100&${q}`)).json() as Page<PublicCourseSummary>
      ).items.map((i) => i.title);
    expect(await titles("q=OPTIONS")).toEqual(
      expect.arrayContaining(["Options Greeks Explained", "Options for Beginners"]),
    );
    expect((await titles("q=greeks")).every((t) => /greeks/i.test(t))).toBe(true);
    expect((await titles("q=options&level=advanced")).every((t) => /options/i.test(t))).toBe(true);
    expect(await titles("q=options&level=advanced")).toEqual(["Options Greeks Explained"]);
    expect(await titles(`q=${encodeURIComponent("100%")}`)).toEqual([
      "100% Risk_Free? It's a trap",
    ]);
    expect(await titles(`q=${encodeURIComponent("risk_free")}`)).toEqual([
      "100% Risk_Free? It's a trap",
    ]);
    expect(await titles(`q=${encodeURIComponent("%")}`)).toEqual(["100% Risk_Free? It's a trap"]);
    expect(await titles(`q=${encodeURIComponent("_____")}`)).toEqual([]);
    expect(await titles(`q=${encodeURIComponent("' OR 1=1 --")}`)).toEqual([]);
    expect(await titles(`q=${encodeURIComponent("\\")}`)).toEqual([]);
  });

  it("opens a published course and gives drafts and unknown ids the same 404", async () => {
    const pub = await make({ title: "Open this course" }, true);
    const res = await h.call("GET", `/courses/${pub.id}`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      id: pub.id,
      title: "Open this course",
      description: valid.description,
      currency: "USD",
    });
    for (const k of ["status", "version", "createdAt", "updatedAt", "createdBy"])
      expect(body).not.toHaveProperty(k);

    const draft = await make({ title: "Secret draft course" });
    const draftRes = await h.call("GET", `/courses/${draft.id}`);
    const unknownRes = await h.call("GET", "/courses/11111111-1111-4111-8111-111111111111");
    expect(draftRes.statusCode).toBe(404);
    expect(stripRequestId(draftRes)).toEqual(stripRequestId(unknownRes));
    expect((await h.call("GET", "/courses/not-a-uuid")).statusCode).toBe(400);
  });
});

describe("openapi", () => {
  it("lists the course routes", async () => {
    const doc = (await h.t.app.inject({ method: "GET", url: "/openapi.json" })).json();
    for (const p of [
      "/courses",
      "/courses/{id}",
      "/staff/courses",
      "/staff/courses/{id}",
      "/staff/courses/{id}/publish",
      "/staff/courses/{id}/unpublish",
    ]) {
      expect(doc.paths[p], p).toBeDefined();
    }
  });
});
