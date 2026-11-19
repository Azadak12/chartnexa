import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Page, PublicCourseDetail, PublicCourseSummary } from "@chartnexa/api-contracts";
import { CoursesService } from "../src/modules/courses/index.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let dir: string;
let admin: Person;
let instructor: Person;
let student: Person;
let svc: CoursesService;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  dir = await mkdtemp(join(tmpdir(), "chartnexa-thumbs-"));
  h = await makeHarness(db.url, { STORAGE_DIR: dir });
  svc = h.t.app.get(CoursesService);
  admin = await person(h, "admin");
  instructor = await person(h, "instructor");
  student = await person(h);
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
  await rm(dir, { recursive: true, force: true });
});

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(200, 1),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 2)]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WEBP"),
  Buffer.alloc(50),
]);

const mk = async (over: Record<string, unknown> = {}) => {
  const c = await svc.create(
    admin.id,
    {
      title: "Presented course",
      description: "A description.",
      level: "beginner",
      priceCents: 1000,
      coverTone: "blue",
      ...over,
    } as never,
    "rq",
  );
  return svc.publish(admin.id, c.id, "rp");
};
const put = (p: Person | undefined, courseId: string, data: Buffer) =>
  h.t.app.inject({
    method: "PUT",
    url: `/staff/courses/${courseId}/thumbnail`,
    headers: {
      ...(p ? { authorization: `Bearer ${p.accessToken}` } : {}),
      "content-type": "application/octet-stream",
    },
    payload: data,
  });
const files = async () => (await readdir(join(dir, "thumbnails")).catch(() => [])) as string[];

describe("thumbnails", () => {
  it("stores a validated image, serves it publicly with long caching, and shows it on cards and details", async () => {
    const c = await mk();
    const res = await put(admin, c.id, PNG);
    expect(res.statusCode).toBe(200);
    const { thumbnailUrl } = res.json() as { thumbnailUrl: string };
    const img = await h.t.app.inject({ method: "GET", url: thumbnailUrl });
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toBe("image/png");
    expect(img.headers["cache-control"]).toContain("immutable");
    expect(img.headers["x-content-type-options"]).toBe("nosniff");
    expect(img.rawPayload.equals(PNG)).toBe(true);
    const list = (await h.call("GET", "/courses")).json() as Page<PublicCourseSummary>;
    expect(list.items.find((i) => i.id === c.id)?.thumbnailUrl).toBe(thumbnailUrl);
    const detail = (await h.call("GET", `/courses/${c.id}`)).json() as PublicCourseDetail;
    expect(detail.thumbnailUrl).toBe(thumbnailUrl);
    expect(await auditRows(h, { action: "course.thumbnail.set", targetId: c.id })).toHaveLength(1);
  });

  it("accepts JPEG and WebP, decides the type from the bytes, and refuses everything else", async () => {
    const c = await mk();
    expect((await put(admin, c.id, JPEG)).statusCode).toBe(200);
    expect((await put(admin, c.id, WEBP)).statusCode).toBe(200);
    for (const bad of [
      Buffer.from("<svg onload=alert(1)>"),
      Buffer.from("GIF89a....."),
      Buffer.from("%PDF-1.4 ..."),
      Buffer.alloc(0),
    ]) {
      expect((await put(admin, c.id, bad)).statusCode).toBeGreaterThanOrEqual(400);
    }
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    const tooBig = await put(admin, c.id, big);
    expect(tooBig.statusCode).toBe(400);
    expect(JSON.stringify(tooBig.json())).toContain("2 MB");
  });

  it("replaces the image, removing the old bytes, and removes it on request", async () => {
    const c = await mk();
    const first = ((await put(admin, c.id, PNG)).json() as { thumbnailUrl: string }).thumbnailUrl;
    const second = ((await put(admin, c.id, JPEG)).json() as { thumbnailUrl: string }).thumbnailUrl;
    expect(second).not.toBe(first);
    expect((await h.t.app.inject({ method: "GET", url: first })).statusCode).toBe(404);
    expect((await h.t.app.inject({ method: "GET", url: second })).headers["content-type"]).toBe(
      "image/jpeg",
    );
    const del = () =>
      h.call("DELETE", `/staff/courses/${c.id}/thumbnail`, { token: admin.accessToken });
    expect((await del()).statusCode).toBe(204);
    expect((await del()).statusCode).toBe(204);
    expect((await h.t.app.inject({ method: "GET", url: second })).statusCode).toBe(404);
    expect(await auditRows(h, { action: "course.thumbnail.remove", targetId: c.id })).toHaveLength(
      1,
    );
    expect(
      ((await h.call("GET", `/courses/${c.id}`)).json() as PublicCourseDetail).thumbnailUrl,
    ).toBeNull();
  });

  it("leaves no stray files when the course does not exist", async () => {
    const before = (await files()).length;
    const res = await put(admin, "00000000-0000-4000-8000-000000000000", PNG);
    expect(res.statusCode).toBe(404);
    expect((await files()).length).toBe(before);
  });

  it("lets only people who may update the course change its thumbnail", async () => {
    const c = await mk();
    const other = await mk();
    expect((await put(undefined, c.id, PNG)).statusCode).toBe(401);
    expect((await put(student, c.id, PNG)).statusCode).toBe(403);
    expect((await put(instructor, c.id, PNG)).statusCode).toBe(403);
    await h.db.instructorGrant.create({
      data: {
        userId: instructor.id,
        permission: "course:update",
        courseId: c.id,
        reason: "Test grant",
      },
    });
    expect((await put(instructor, c.id, PNG)).statusCode).toBe(200);
    expect((await put(instructor, other.id, PNG)).statusCode).toBe(403);
    expect(
      (
        await h.call("DELETE", `/staff/courses/${other.id}/thumbnail`, {
          token: instructor.accessToken,
        })
      ).statusCode,
    ).toBe(403);
  });

  it("refuses an unknown or malformed image address", async () => {
    expect(
      (await h.t.app.inject({ method: "GET", url: "/courses/thumbnails/not-a-uuid" })).statusCode,
    ).toBe(400);
    expect(
      (
        await h.t.app.inject({
          method: "GET",
          url: "/courses/thumbnails/00000000-0000-4000-8000-000000000000",
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe("instructor and category on courses", () => {
  it("shows the category name and the instructor, set automatically for an Instructor's own course", async () => {
    const cat = await h.call("POST", "/staff/categories", {
      token: admin.accessToken,
      body: { name: "Charting" },
    });
    const catId = (cat.json() as { id: string }).id;
    await h.db.instructorGrant.create({
      data: {
        userId: instructor.id,
        permission: "course:update",
        courseId: (await mk()).id,
        reason: "Test grant",
      },
    });
    await h.db.user.update({
      where: { id: instructor.id },
      data: { displayName: "Dana Instructor" },
    });
    await h.db.userRole.updateMany({
      where: { userId: instructor.id },
      data: { role: "instructor" },
    });
    const created = await h.call("POST", "/staff/courses", {
      token: instructor.accessToken,
      body: {
        title: "Mine",
        description: "d",
        level: "beginner",
        priceCents: 0,
        coverTone: "blue",
        categoryId: catId,
      },
    });
    // An Instructor needs course:create for this; give it, then retry.
    if (created.statusCode === 403) {
      await h.db.instructorGrant.create({
        data: {
          userId: instructor.id,
          permission: "course:create",
          courseId: null,
          reason: "Test grant",
        },
      });
    }
    const res =
      created.statusCode === 403
        ? await h.call("POST", "/staff/courses", {
            token: instructor.accessToken,
            body: {
              title: "Mine",
              description: "d",
              level: "beginner",
              priceCents: 0,
              coverTone: "blue",
              categoryId: catId,
            },
          })
        : created;
    expect(res.statusCode).toBe(201);
    const id = (res.json() as { id: string }).id;
    await h.call("POST", `/staff/courses/${id}/publish`, { token: admin.accessToken });
    const detail = (await h.call("GET", `/courses/${id}`)).json() as PublicCourseDetail;
    expect(detail.categoryName).toBe("Charting");
    expect(detail.instructor).toMatchObject({ displayName: "Dana Instructor" });
    const list = (await h.call("GET", "/courses?q=Mine")).json() as Page<PublicCourseSummary>;
    expect(list.items.find((i) => i.id === id)?.instructor?.displayName).toBe("Dana Instructor");
    // A course made by an Admin has no instructor until one is assigned.
    const adminMade = await mk({ title: "By admin" });
    expect(
      ((await h.call("GET", `/courses/${adminMade.id}`)).json() as PublicCourseDetail).instructor,
    ).toBeNull();
  });
});
