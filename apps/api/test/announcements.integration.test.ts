import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Announcement, Page, StaffAnnouncement } from "@chartnexa/api-contracts";
import { CoursesService } from "../src/modules/courses/index.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let admin: Person;
let manager: Person;
let courses: CoursesService;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
  courses = h.t.app.get(CoursesService);
  admin = await person(h, "admin");
  manager = await person(h, "manager");
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

type M = "GET" | "POST" | "PUT";
const call = (p: Person | undefined, method: M, url: string, body?: unknown) =>
  h.call(method, url, {
    ...(p ? { token: p.accessToken } : {}),
    ...(body !== undefined ? { body } : {}),
  });
const mkCourse = async () => {
  const c = await courses.create(
    admin.id,
    {
      title: "Announced course",
      description: "A complete description",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    } as never,
    "rq",
  );
  return courses.publish(admin.id, c.id, "rp");
};
const owner = async (courseId: string) => {
  const p = await person(h);
  await h.db.entitlement.create({
    data: { userId: p.id, courseId, source: "admin_grant", grantReason: "Test grant" },
  });
  return p;
};
const post = async (over: Record<string, unknown> = {}, who: Person = manager) => {
  const res = await call(who, "POST", "/staff/announcements", {
    title: "Market holiday",
    body: "No live classes on Friday.",
    idempotencyKey: randomUUID(),
    ...over,
  });
  return { res, body: res.json() as StaffAnnouncement };
};
const feed = async (p: Person, cursor?: string) =>
  (
    await call(
      p,
      "GET",
      `/me/announcements${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    )
  ).json() as Page<Announcement>;
const unread = async (p: Person) =>
  ((await call(p, "GET", "/me/announcements/unread-count")).json() as { unread: number }).unread;

describe("publishing", () => {
  it("publishes to everyone, records an audit event, and is seen by any signed-in person", async () => {
    const { res, body } = await post({ title: "  Welcome  " });
    expect(res.statusCode).toBe(200);
    expect(body).toMatchObject({
      title: "Welcome",
      courseId: null,
      status: "published",
      readCount: 0,
      authorId: manager.id,
    });
    const reader = await person(h);
    expect((await feed(reader)).items.map((a) => a.id)).toContain(body.id);
    const audit = await auditRows(h, { action: "announcement.publish", targetId: body.id });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.after).toMatchObject({ audience: "everyone", title: "Welcome" });
  });

  it("is idempotent per author and key, also under a race; a reused key for other text is 409", async () => {
    const key = randomUUID();
    const results = await Promise.all([1, 2, 3].map(() => post({ idempotencyKey: key })));
    expect(results.map((r) => r.res.statusCode)).toEqual([200, 200, 200]);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await h.db.announcement.count({ where: { idempotencyKey: key } })).toBe(1);
    const reused = await post({ idempotencyKey: key, body: "Something else" });
    expect(reused.res.statusCode).toBe(409);
    // Another author may use the same key.
    expect((await post({ idempotencyKey: key }, admin)).body.id).not.toBe(results[0]?.body.id);
  });

  it("refuses bad input", async () => {
    for (const over of [
      { title: "ab" },
      { title: "x".repeat(121) },
      { body: "   " },
      { body: "x".repeat(4001) },
      { idempotencyKey: "short" },
      { courseId: "not-a-uuid" },
      { audience: "everyone" },
    ]) {
      expect((await post(over)).res.statusCode, JSON.stringify(over)).toBe(400);
    }
    expect((await post({ courseId: "00000000-0000-4000-8000-000000000000" })).res.statusCode).toBe(
      404,
    );
  });

  it("lets only holders of announcements:publish post, list or withdraw", async () => {
    const { body } = await post();
    const instructor = await person(h, "instructor");
    const student = await person(h);
    for (const p of [instructor, student]) {
      expect((await post({}, p)).res.statusCode).toBe(403);
      expect((await call(p, "GET", "/staff/announcements")).statusCode).toBe(403);
      expect(
        (await call(p, "POST", `/staff/announcements/${body.id}/withdraw`, { reason: "Not mine" }))
          .statusCode,
      ).toBe(403);
    }
    expect((await call(undefined, "GET", "/staff/announcements")).statusCode).toBe(401);
    expect((await call(undefined, "GET", "/me/announcements")).statusCode).toBe(401);
  });
});

describe("course announcements", () => {
  it("reach only people with active access to the course", async () => {
    const c = await mkCourse();
    const other = await mkCourse();
    const insider = await owner(c.id);
    const outsider = await owner(other.id);
    const { body } = await post({ courseId: c.id, title: "Course update" });
    expect(body).toMatchObject({ courseId: c.id, courseTitle: "Announced course" });
    expect((await feed(insider)).items.find((a) => a.id === body.id)).toMatchObject({
      courseTitle: "Announced course",
      read: false,
    });
    expect((await feed(outsider)).items.map((a) => a.id)).not.toContain(body.id);
    expect((await call(outsider, "PUT", `/me/announcements/${body.id}/read`)).statusCode).toBe(404);
    await h.db.entitlement.updateMany({
      where: { userId: insider.id },
      data: { status: "revoked", revokedAt: new Date(), revokeReason: "Test revoke" },
    });
    expect((await feed(insider)).items.map((a) => a.id)).not.toContain(body.id);
  });
});

describe("reading", () => {
  it("counts unread, marks read once, and pages newest first", async () => {
    const reader = await person(h);
    const before = await unread(reader);
    const first = (await post({ title: "First news" })).body;
    const second = (await post({ title: "Second news" })).body;
    expect(await unread(reader)).toBe(before + 2);
    const both = await Promise.all(
      [1, 2].map(() => call(reader, "PUT", `/me/announcements/${first.id}/read`)),
    );
    expect(both.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(await unread(reader)).toBe(before + 1);
    const page = (
      await call(reader, "GET", "/me/announcements?limit=1")
    ).json() as Page<Announcement>;
    expect(page.items[0]).toMatchObject({ id: second.id, read: false });
    const next = (
      await call(
        reader,
        "GET",
        `/me/announcements?limit=1&cursor=${encodeURIComponent(page.nextCursor as string)}`,
      )
    ).json() as Page<Announcement>;
    expect(next.items[0]).toMatchObject({ id: first.id, read: true });
    const staff = (
      await call(manager, "GET", "/staff/announcements")
    ).json() as Page<StaffAnnouncement>;
    expect(staff.items.find((a) => a.id === first.id)?.readCount).toBe(1);
    expect((await call(reader, "GET", "/me/announcements?cursor=forged")).statusCode).toBe(400);
  });

  it("withdraws with a reason once; readers stop seeing it and cannot mark it", async () => {
    const reader = await person(h);
    const { body } = await post();
    const url = `/staff/announcements/${body.id}/withdraw`;
    expect((await call(manager, "POST", url, { reason: "x" })).statusCode).toBe(400);
    const first = await call(admin, "POST", url, { reason: "Posted by mistake" });
    expect(first.json()).toMatchObject({
      status: "withdrawn",
      withdrawReason: "Posted by mistake",
    });
    const again = await call(manager, "POST", url, { reason: "Again" });
    expect(again.json()).toMatchObject({ withdrawReason: "Posted by mistake" });
    expect(await auditRows(h, { action: "announcement.withdraw", targetId: body.id })).toHaveLength(
      1,
    );
    expect((await feed(reader)).items.map((a) => a.id)).not.toContain(body.id);
    expect((await call(reader, "PUT", `/me/announcements/${body.id}/read`)).statusCode).toBe(404);
    expect(
      (
        await call(
          manager,
          "POST",
          "/staff/announcements/00000000-0000-4000-8000-000000000000/withdraw",
          { reason: "Gone" },
        )
      ).statusCode,
    ).toBe(404);
  });

  it("removes a person's read marks with their account", async () => {
    const reader = await person(h);
    const { body } = await post();
    await call(reader, "PUT", `/me/announcements/${body.id}/read`);
    const res = await h.call("DELETE", "/me", {
      token: reader.accessToken,
      body: { password: reader.password },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(await h.db.announcementRead.count({ where: { userId: reader.id } })).toBe(0);
  });

  it("is refused by the database when the data is bad", async () => {
    const base = { title: "Direct", body: "Body", idempotencyKey: randomUUID() };
    for (const over of [
      { status: "draft" },
      { status: "withdrawn" },
      { title: "ab" },
      { body: "" },
      { withdrawReason: "x", withdrawnAt: new Date(), status: "withdrawn" },
    ]) {
      await expect(
        h.db.announcement.create({
          data: { ...base, idempotencyKey: randomUUID(), ...over } as never,
        }),
        JSON.stringify(over),
      ).rejects.toThrow();
    }
  });
});
