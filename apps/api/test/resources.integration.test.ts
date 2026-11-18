import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  UPLOAD_PART_BYTES,
  type FileLink,
  type StaffResource,
  type UploadSession,
} from "@chartnexa/api-contracts";
import { CoursesService } from "../src/modules/courses/index.js";
import { ResourcesService } from "../src/modules/resources/index.js";
import { MALWARE_SCANNER, type MalwareScanner } from "../src/modules/resources/scanner.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let dir: string;
let admin: Person;
let manager: Person;
let courses: CoursesService;
let resources: ResourcesService;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  dir = await mkdtemp(join(tmpdir(), "chartnexa-storage-"));
  h = await makeHarness(db.url, { STORAGE_DIR: dir, FILE_LINK_TTL_SECONDS: "60" });
  courses = h.t.app.get(CoursesService);
  resources = h.t.app.get(ResourcesService);
  admin = await person(h, "admin");
  manager = await person(h, "manager");
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
  await rm(dir, { recursive: true, force: true });
});

const PDF = Buffer.concat([
  Buffer.from("%PDF-1.7\n"),
  Buffer.alloc(200, 0x20),
  Buffer.from("%%EOF"),
]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const DOCX = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from("....word/document.xml...."),
]);
const EXE = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(100, 0)]);

const call = (
  p: Person | undefined,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
) =>
  h.call(method, url, {
    ...(p ? { token: p.accessToken } : {}),
    ...(body !== undefined ? { body } : {}),
  });
const putPart = (p: Person, c: string, uploadId: string, n: number, data: Buffer) =>
  h.t.app.inject({
    method: "PUT",
    url: `/staff/courses/${c}/uploads/${uploadId}/parts/${n}`,
    headers: {
      authorization: `Bearer ${p.accessToken}`,
      "content-type": "application/octet-stream",
    },
    payload: data,
  });
const mkCourse = async (publish = true) => {
  const c = await courses.create(
    admin.id,
    {
      title: "Files course",
      description: "A complete description",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    } as never,
    "rq",
  );
  return publish ? courses.publish(admin.id, c.id, "rp") : c;
};
const mkLesson = async (courseId: string, isPreview = false) => {
  const res = await call(manager, "POST", `/staff/courses/${courseId}/lessons`, {
    title: "With files",
    idempotencyKey: randomUUID(),
    isPreview,
  });
  return res.json() as { id: string };
};
/** Start, send every part, complete. */
const upload = async (
  c: string,
  l: string,
  data: Buffer,
  meta: { fileName: string; mimeType: string },
  done: Record<string, unknown> = { title: "Notes" },
  who = manager,
) => {
  const started = await call(who, "POST", `/staff/courses/${c}/lessons/${l}/uploads`, {
    ...meta,
    size: data.length,
  });
  expect(started.statusCode).toBe(200);
  const s = started.json() as UploadSession;
  for (let n = 1; n <= s.partCount; n++) {
    const part = data.subarray((n - 1) * s.partSize, n * s.partSize);
    expect((await putPart(who, c, s.uploadId, n, part)).statusCode).toBe(200);
  }
  return {
    s,
    res: await call(who, "POST", `/staff/courses/${c}/uploads/${s.uploadId}/complete`, done),
  };
};
const owner = async (courseId: string) => {
  const p = await person(h);
  await h.db.entitlement.create({
    data: { userId: p.id, courseId, source: "admin_grant", grantReason: "Test grant" },
  });
  return p;
};
const files = async () => {
  const out: string[] = [];
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (e.isDirectory()) await walk(join(d, e.name));
      else out.push(join(d, e.name));
    }
  };
  await walk(dir);
  return out;
};

describe("uploading files", () => {
  it("stores a checked PDF as a resource, audited, with parts removed afterwards", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    const { s: session, res } = await upload(
      c.id,
      l.id,
      PDF,
      { fileName: "notes.pdf", mimeType: "application/pdf" },
      { title: "  Chart notes " },
    );
    expect(res.statusCode).toBe(200);
    const r = res.json() as StaffResource;
    expect(r).toMatchObject({
      title: "Chart notes",
      fileName: "notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: PDF.length,
      downloadable: false,
      scanStatus: "not_scanned",
    });
    const row = await h.db.lessonResource.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await files()).some((f) => f.includes(session.uploadId))).toBe(false);
    const audit = await auditRows(h, { action: "resource.create", targetId: r.id });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain("notes.pdf");
  });

  it("assembles a file sent in several parts, in any order, with a retried part", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    const big = Buffer.concat([
      Buffer.from("%PDF-1.4\n"),
      Buffer.alloc(UPLOAD_PART_BYTES * 2 + 10, 0x41),
    ]);
    const s = (
      await call(manager, "POST", `/staff/courses/${c.id}/lessons/${l.id}/uploads`, {
        fileName: "big.pdf",
        mimeType: "application/pdf",
        size: big.length,
      })
    ).json() as UploadSession;
    expect(s.partCount).toBe(3);
    const part = (n: number) => big.subarray((n - 1) * s.partSize, n * s.partSize);
    for (const n of [3, 1, 2, 2])
      expect((await putPart(manager, c.id, s.uploadId, n, part(n))).statusCode).toBe(200);
    const res = await call(
      manager,
      "POST",
      `/staff/courses/${c.id}/uploads/${s.uploadId}/complete`,
      { title: "Big" },
    );
    expect((res.json() as StaffResource).sizeBytes).toBe(big.length);
  });

  it("refuses wrong part sizes and numbers, and a complete with a missing part", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    const data = Buffer.concat([
      Buffer.from("%PDF-1.4\n"),
      Buffer.alloc(UPLOAD_PART_BYTES + 5, 0x41),
    ]);
    const s = (
      await call(manager, "POST", `/staff/courses/${c.id}/lessons/${l.id}/uploads`, {
        fileName: "a.pdf",
        mimeType: "application/pdf",
        size: data.length,
      })
    ).json() as UploadSession;
    expect((await putPart(manager, c.id, s.uploadId, 1, data.subarray(0, 100))).statusCode).toBe(
      400,
    );
    expect((await putPart(manager, c.id, s.uploadId, 3, data.subarray(0, 10))).statusCode).toBe(
      400,
    );
    expect(
      (await putPart(manager, c.id, s.uploadId, 1, data.subarray(0, s.partSize))).statusCode,
    ).toBe(200);
    const incomplete = await call(
      manager,
      "POST",
      `/staff/courses/${c.id}/uploads/${s.uploadId}/complete`,
      { title: "A" },
    );
    expect(incomplete.statusCode).toBe(409);
    expect((incomplete.json() as { code: string }).code).toBe("UPLOAD_INCOMPLETE");
    const json = await call(
      manager,
      "PUT",
      `/staff/courses/${c.id}/uploads/${s.uploadId}/parts/2`,
      { x: 1 },
    );
    expect(json.statusCode).toBe(400);
  });

  it("checks the bytes: a renamed program or a lying type is refused and nothing is kept", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    for (const [data, meta] of [
      [EXE, { fileName: "notes.pdf", mimeType: "application/pdf" }],
      [PNG, { fileName: "picture.jpg", mimeType: "image/jpeg" }],
      [
        PDF,
        {
          fileName: "doc.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      ],
    ] as const) {
      const { s: session, res } = await upload(c.id, l.id, data, meta);
      expect(res.statusCode).toBe(400);
      expect((res.json() as { fields: { field: string }[] }).fields[0]!.field).toBe("file");
      expect((await files()).some((f) => f.includes(session.uploadId))).toBe(false);
    }
    expect(await h.db.lessonResource.count({ where: { lessonId: l.id } })).toBe(0);
  });

  it("refuses unsupported types, oversize files and a mismatched extension before any upload", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    const start = (body: unknown) =>
      call(manager, "POST", `/staff/courses/${c.id}/lessons/${l.id}/uploads`, body);
    expect(
      (await start({ fileName: "a.exe", mimeType: "application/x-msdownload", size: 10 }))
        .statusCode,
    ).toBe(400);
    expect(
      (await start({ fileName: "a.pdf", mimeType: "application/pdf", size: 50 * 1024 * 1024 + 1 }))
        .statusCode,
    ).toBe(400);
    expect(
      (await start({ fileName: "a.pdf", mimeType: "application/pdf", size: 0 })).statusCode,
    ).toBe(400);
    const ext = await start({ fileName: "a.png", mimeType: "application/pdf", size: 10 });
    expect((ext.json() as { fields: { field: string }[] }).fields[0]!.field).toBe("fileName");
  });

  it("accepts Word, PNG and text files whose bytes match", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    for (const [data, meta] of [
      [
        DOCX,
        {
          fileName: "w.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      ],
      [PNG, { fileName: "chart.png", mimeType: "image/png" }],
      [Buffer.from("Plain text notes\nline two"), { fileName: "t.txt", mimeType: "text/plain" }],
    ] as const) {
      expect((await upload(c.id, l.id, data, meta)).res.statusCode).toBe(200);
    }
  });

  it("rejects an infected file and keeps nothing", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    const scanner = h.t.app.get<MalwareScanner>(MALWARE_SCANNER);
    const spy = vi.spyOn(scanner, "scan").mockResolvedValueOnce("infected");
    try {
      const { res } = await upload(c.id, l.id, PDF, {
        fileName: "x.pdf",
        mimeType: "application/pdf",
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.stringify(res.json())).toContain("malware");
    } finally {
      spy.mockRestore();
    }
    expect(await h.db.lessonResource.count({ where: { lessonId: l.id } })).toBe(0);
  });

  it("gives one resource when complete is sent twice, even at once", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    const s = (
      await call(manager, "POST", `/staff/courses/${c.id}/lessons/${l.id}/uploads`, {
        fileName: "a.pdf",
        mimeType: "application/pdf",
        size: PDF.length,
      })
    ).json() as UploadSession;
    await putPart(manager, c.id, s.uploadId, 1, PDF);
    const res = await Promise.all(
      Array.from({ length: 4 }, () =>
        call(manager, "POST", `/staff/courses/${c.id}/uploads/${s.uploadId}/complete`, {
          title: "A",
        }),
      ),
    );
    const ok = res.filter((r) => r.statusCode === 200).map((r) => (r.json() as StaffResource).id);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ok).size).toBe(1);
    expect(await h.db.lessonResource.count({ where: { lessonId: l.id } })).toBe(1);
    const stored = (await files()).filter((f) => f.includes(`resources`) && f.includes(c.id));
    expect(stored).toHaveLength(1);
  });

  it("cancels an upload, removing its parts; cancelling again succeeds and parts are then refused", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    const s = (
      await call(manager, "POST", `/staff/courses/${c.id}/lessons/${l.id}/uploads`, {
        fileName: "a.pdf",
        mimeType: "application/pdf",
        size: PDF.length,
      })
    ).json() as UploadSession;
    await putPart(manager, c.id, s.uploadId, 1, PDF);
    expect(
      (await call(manager, "DELETE", `/staff/courses/${c.id}/uploads/${s.uploadId}`)).json(),
    ).toEqual({ cancelled: true });
    expect(
      (await call(manager, "DELETE", `/staff/courses/${c.id}/uploads/${s.uploadId}`)).json(),
    ).toEqual({ cancelled: false });
    expect((await putPart(manager, c.id, s.uploadId, 1, PDF)).statusCode).toBe(409);
    expect((await files()).some((f) => f.includes(s.uploadId))).toBe(false);
  });

  it("limits files per lesson to 20", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    await h.db.lessonResource.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        courseId: c.id,
        lessonId: l.id,
        title: `F${i}`,
        fileName: "f.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        sha256: "a".repeat(64),
        storageKey: `resources/${c.id}/seed-${i}`,
        scanStatus: "not_scanned",
      })),
    });
    const res = await call(manager, "POST", `/staff/courses/${c.id}/lessons/${l.id}/uploads`, {
      fileName: "a.pdf",
      mimeType: "application/pdf",
      size: 10,
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("permissions", () => {
  it("lets only people who may author the course's lessons upload or manage files", async () => {
    const c = await mkCourse();
    const other = await mkCourse();
    const l = await mkLesson(c.id);
    const teacher = await person(h, "instructor");
    await h.db.instructorGrant.create({
      data: {
        userId: teacher.id,
        permission: "lesson:upload",
        courseId: c.id,
        reason: "Test grant",
      },
    });
    expect(
      (
        await upload(
          c.id,
          l.id,
          PDF,
          { fileName: "t.pdf", mimeType: "application/pdf" },
          { title: "T" },
          teacher,
        )
      ).res.statusCode,
    ).toBe(200);
    const student = await person(h);
    const body = { fileName: "x.pdf", mimeType: "application/pdf", size: 10 };
    expect(
      (await call(student, "POST", `/staff/courses/${c.id}/lessons/${l.id}/uploads`, body))
        .statusCode,
    ).toBe(403);
    expect(
      (await call(teacher, "POST", `/staff/courses/${other.id}/lessons/${l.id}/uploads`, body))
        .statusCode,
    ).toBe(403);
    expect(
      (await call(undefined, "POST", `/staff/courses/${c.id}/lessons/${l.id}/uploads`, body))
        .statusCode,
    ).toBe(401);
    // An upload id is useless under another course, even to someone allowed there.
    const s = (
      await call(manager, "POST", `/staff/courses/${c.id}/lessons/${l.id}/uploads`, {
        ...body,
        size: PDF.length,
      })
    ).json() as UploadSession;
    expect((await putPart(manager, other.id, s.uploadId, 1, PDF)).statusCode).toBe(404);
  });
});

describe("students reading files", () => {
  const setup = async (isPreview = false, downloadable = false) => {
    const c = await mkCourse();
    const l = await mkLesson(c.id, isPreview);
    const r = (
      await upload(
        c.id,
        l.id,
        PDF,
        { fileName: "Lesson notes.pdf", mimeType: "application/pdf" },
        { title: "Notes", downloadable },
      )
    ).res.json() as StaffResource;
    return { c, l, r };
  };
  const link = (p: Person | undefined, c: string, l: string, r: string, download = false) =>
    call(p, "POST", `/courses/${c}/lessons/${l}/resources/${r}/link`, { download });

  it("owners list files and read one through a short-lived link with safe headers", async () => {
    const { c, l, r } = await setup();
    const p = await owner(c.id);
    const list = (await call(p, "GET", `/courses/${c.id}/lessons/${l.id}/resources`)).json() as {
      items: Record<string, unknown>[];
    };
    expect(list.items).toHaveLength(1);
    expect(Object.keys(list.items[0]!).sort()).toEqual([
      "downloadable",
      "fileName",
      "id",
      "mimeType",
      "sizeBytes",
      "title",
    ]);
    const res = await link(p, c.id, l.id, r.id);
    expect(res.statusCode).toBe(200);
    const lk = res.json() as FileLink;
    expect(lk.url).toMatch(new RegExp(`^/files/${r.id}\\?t=`));
    const file = await h.call("GET", lk.url);
    expect(file.statusCode).toBe(200);
    expect(file.rawPayload.equals(PDF)).toBe(true);
    expect(file.headers["content-type"]).toBe("application/pdf");
    expect(file.headers["content-disposition"]).toBe("inline; filename*=UTF-8''Lesson%20notes.pdf");
    expect(file.headers["cache-control"]).toBe("private, no-store");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    // The token travels as a query value, so it never appears in request logs.
    expect(h.t.logs()).not.toContain(lk.url.split("t=")[1]!.slice(0, 20));
  });

  it("refuses strangers on locked lessons, and anyone with a forged, altered or expired link", async () => {
    const { c, l, r } = await setup();
    const stranger = await person(h);
    expect(
      (await call(stranger, "GET", `/courses/${c.id}/lessons/${l.id}/resources`)).statusCode,
    ).toBe(403);
    expect((await link(stranger, c.id, l.id, r.id)).statusCode).toBe(403);
    expect((await link(undefined, c.id, l.id, r.id)).statusCode).toBe(403);
    const p = await owner(c.id);
    const lk = (await link(p, c.id, l.id, r.id)).json() as FileLink;
    const token = lk.url.split("t=")[1]!;
    expect((await h.call("GET", `/files/${r.id}`)).statusCode).toBe(404);
    expect((await h.call("GET", `/files/${r.id}?t=${token.slice(0, -2)}xx`)).statusCode).toBe(404);
    expect((await h.call("GET", `/files/${randomUUID()}?t=${token}`)).statusCode).toBe(404);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 61_000);
      expect((await h.call("GET", lk.url)).statusCode).toBe(404);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets anyone read files of a free-preview lesson", async () => {
    const { c, l, r } = await setup(true);
    const lk = (await link(undefined, c.id, l.id, r.id)).json() as FileLink;
    expect((await h.call("GET", lk.url)).statusCode).toBe(200);
  });

  it("allows downloads only when staff turned them on", async () => {
    const locked = await setup(false, false);
    const p = await owner(locked.c.id);
    const refused = await link(p, locked.c.id, locked.l.id, locked.r.id, true);
    expect(refused.statusCode).toBe(403);
    expect((refused.json() as { code: string }).code).toBe("DOWNLOAD_NOT_ALLOWED");
    const open = await setup(false, true);
    const q = await owner(open.c.id);
    const lk = (await link(q, open.c.id, open.l.id, open.r.id, true)).json() as FileLink;
    const file = await h.call("GET", lk.url);
    expect(file.headers["content-disposition"]).toMatch(/^attachment;/);
  });

  it("stops a download link working once staff turn downloads off", async () => {
    const { c, l, r } = await setup(false, true);
    const p = await owner(c.id);
    const lk = (await link(p, c.id, l.id, r.id, true)).json() as FileLink;
    await call(manager, "PATCH", `/staff/courses/${c.id}/lessons/${l.id}/resources/${r.id}`, {
      expectedVersion: r.version,
      downloadable: false,
    });
    expect((await h.call("GET", lk.url)).statusCode).toBe(404);
  });
});

describe("managing files", () => {
  it("renames and toggles downloads with a version, replaces the file, and deletes", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    const r = (
      await upload(c.id, l.id, PDF, { fileName: "a.pdf", mimeType: "application/pdf" })
    ).res.json() as StaffResource;
    const base = `/staff/courses/${c.id}/lessons/${l.id}/resources/${r.id}`;
    const renamed = await call(manager, "PATCH", base, {
      expectedVersion: 1,
      title: "Renamed",
      downloadable: true,
    });
    expect(renamed.json()).toMatchObject({ title: "Renamed", downloadable: true, version: 2 });
    expect(
      (await call(manager, "PATCH", base, { expectedVersion: 1, title: "Stale" })).statusCode,
    ).toBe(409);
    const oldKey = (await h.db.lessonResource.findUniqueOrThrow({ where: { id: r.id } }))
      .storageKey;
    const replaced = (
      await upload(
        c.id,
        l.id,
        PNG,
        { fileName: "b.png", mimeType: "image/png" },
        { title: "Picture", replaceResourceId: r.id },
      )
    ).res.json() as StaffResource;
    expect(replaced).toMatchObject({
      id: r.id,
      mimeType: "image/png",
      fileName: "b.png",
      version: 3,
      downloadable: true,
    });
    expect((await files()).some((f) => f.endsWith(oldKey.split("/").pop()!))).toBe(false);
    expect((await call(manager, "DELETE", base)).json()).toEqual({ deleted: true });
    expect((await call(manager, "DELETE", base)).json()).toEqual({ deleted: false });
    expect((await files()).filter((f) => f.includes(c.id))).toHaveLength(0);
  });
});

describe("cleanup", () => {
  it("removes expired uploads and bytes of deleted lessons, but keeps fresh files", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    const r = (
      await upload(c.id, l.id, PDF, { fileName: "a.pdf", mimeType: "application/pdf" })
    ).res.json() as StaffResource;
    const key = (await h.db.lessonResource.findUniqueOrThrow({ where: { id: r.id } })).storageKey;
    const s = (
      await call(manager, "POST", `/staff/courses/${c.id}/lessons/${l.id}/uploads`, {
        fileName: "b.pdf",
        mimeType: "application/pdf",
        size: PDF.length,
      })
    ).json() as UploadSession;
    await putPart(manager, c.id, s.uploadId, 1, PDF);
    await call(manager, "DELETE", `/staff/courses/${c.id}/lessons/${l.id}`);
    // Right after deletion the bytes are still young, so a cleanup keeps them.
    expect((await resources.cleanup()).orphanObjects).toBe(0);
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(join(dir, key), old, old);
    const later = new Date(Date.now() + 25 * 60 * 60 * 1000);
    const result = await resources.cleanup(later);
    expect(result.orphanObjects).toBeGreaterThanOrEqual(1);
    expect((await files()).some((f) => f.endsWith(key.split("/").pop()!))).toBe(false);
  });
});
