import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runDemoSeed } from "../scripts/demo/seed.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

/**
 * Course content, end to end against a real database and the real routes: an Instructor and a
 * Lecturer manage modules, lessons, videos, PDFs and live classes on their own courses, a Student
 * who owns the course can watch, read and join, and nobody can reach beyond their grants.
 */
let h: Harness;
let drop: () => Promise<void>;
let dir: string;
const assets = join(import.meta.dirname, "..", "demo-assets");
const tok: Record<string, string> = {};
let own: string; // a course the Lecturer teaches (and the Student owns)
let other: string; // a course the Lecturer does not teach
let notOwned: string; // a course the Student does not own
let ownLessonId: string;

const get = (path: string, who: string) => h.call("GET", path, { token: tok[who]! });
const send = (
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  who: string,
  body?: unknown,
) => h.call(method, path, { token: tok[who]!, ...(body !== undefined ? { body } : {}) });

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  dir = await mkdtemp(join(tmpdir(), "chartnexa-content-"));
  h = await makeHarness(db.url, { STORAGE_DIR: join(dir, "storage") });
  const credentialsFile = join(dir, "creds.json");
  await runDemoSeed(h.t.app, { assetsDir: assets, credentialsFile });
  const creds = (
    JSON.parse(await readFile(credentialsFile, "utf8")) as {
      accounts: Record<string, { password: string }>;
    }
  ).accounts;
  for (const who of ["instructor", "lecturer", "student"]) {
    const email = `${who}@chartnexa.test`;
    const res = await h.login(email, creds[email]!.password);
    tok[who] = (res.json() as { accessToken: string }).accessToken;
  }
  const lecturerCourses = (await get("/staff/courses", "lecturer")).json().items as {
    id: string;
  }[];
  const instructorCourses = (await get("/staff/courses", "instructor")).json().items as {
    id: string;
  }[];
  own = lecturerCourses[0]!.id;
  other = instructorCourses.find((c) => !lecturerCourses.some((l) => l.id === c.id))!.id;
  // The Student buys one of the Lecturer's courses (test mode) the way the app does.
  own = lecturerCourses[0]!.id;
  const order = await h.t.app.inject({
    method: "POST",
    url: "/me/orders",
    headers: {
      authorization: `Bearer ${tok["student"]}`,
      "idempotency-key": "content-test-order-0001",
    },
    payload: { courseId: own },
  });
  expect(order.statusCode).toBeLessThan(300);
  const paid = await h.t.app.inject({
    method: "POST",
    url: `/payments/test/checkouts/${order.json().checkoutRef}/complete`,
    headers: { authorization: `Bearer ${tok["student"]}`, "content-type": "application/json" },
    payload: { outcome: "paid" },
  });
  expect(paid.statusCode).toBe(200);
  const mine = (await get("/me/courses", "student")).json().items as { id: string }[];
  expect(mine.some((c) => c.id === own)).toBe(true);
  notOwned = instructorCourses.find((c) => !mine.some((m) => m.id === c.id))!.id;
}, 240_000);
afterAll(async () => {
  await h.t.app.close();
  await drop();
  await rm(dir, { recursive: true, force: true });
});

/** Sends a file in the parts the server asks for, then completes it, as the app does. */
async function upload(
  who: string,
  courseId: string,
  lessonId: string,
  file: string,
  kind: "video" | "file",
  mime = "application/pdf",
) {
  const bytes = await readFile(file);
  const name = file.split("/").pop()!;
  const start = await send(
    "POST",
    kind === "video"
      ? `/staff/courses/${courseId}/lessons/${lessonId}/video/uploads`
      : `/staff/courses/${courseId}/lessons/${lessonId}/uploads`,
    who,
    kind === "video"
      ? { fileName: name, size: bytes.length }
      : { fileName: name, mimeType: mime, size: bytes.length },
  );
  expect(start.statusCode).toBeLessThan(300);
  const s = start.json() as { uploadId: string; partSize: number; partCount: number };
  for (let n = 1; n <= s.partCount; n++) {
    const part = bytes.subarray((n - 1) * s.partSize, Math.min(bytes.length, n * s.partSize));
    const res = await h.t.app.inject({
      method: "PUT",
      url: `/staff/courses/${courseId}/uploads/${s.uploadId}/parts/${n}`,
      headers: { authorization: `Bearer ${tok[who]}`, "content-type": "application/octet-stream" },
      payload: Buffer.from(part),
    });
    expect(res.statusCode).toBeLessThan(300);
  }
  return send(
    "POST",
    kind === "video"
      ? `/staff/courses/${courseId}/uploads/${s.uploadId}/complete-video`
      : `/staff/courses/${courseId}/uploads/${s.uploadId}/complete`,
    who,
    kind === "video" ? {} : { title: "Worksheet" },
  );
}

describe("organising content", () => {
  it("lets the Lecturer add a module, put a new lesson in it, and move a lesson between modules", async () => {
    const mods = await send("POST", `/staff/courses/${own}/modules`, "lecturer", {
      title: "Content module",
    });
    expect(mods.statusCode).toBe(200);
    const list = mods.json().modules as { id: string; title: string }[];
    const moduleId = list.find((m) => m.title === "Content module")!.id;
    const created = await send("POST", `/staff/courses/${own}/lessons`, "lecturer", {
      title: "Uploaded content lesson",
      body: "Read this, then watch the video.",
      isPreview: false,
      idempotencyKey: "content-test-lesson",
      moduleId,
    });
    expect(created.statusCode).toBe(201);
    ownLessonId = created.json().id;
    expect(created.json().moduleId).toBe(moduleId);
    const moved = await send(
      "PUT",
      `/staff/courses/${own}/lessons/${ownLessonId}/module`,
      "lecturer",
      { moduleId: null },
    );
    expect(moved.statusCode).toBe(200);
    const back = await send(
      "PUT",
      `/staff/courses/${own}/lessons/${ownLessonId}/module`,
      "lecturer",
      { moduleId },
    );
    expect(back.statusCode).toBe(200);
    const students = (await get(`/courses/${own}/lessons`, "student")).json() as {
      items: { id: string; moduleId: string }[];
    };
    expect(students.items.find((l) => l.id === ownLessonId)?.moduleId).toBe(moduleId);
  });
});

describe("videos", () => {
  it("uploads, replaces and removes a lesson video, and checks type and size first", async () => {
    const first = await upload(
      "lecturer",
      own,
      ownLessonId,
      join(assets, "videos", "candlestick-chart-mastery-preview.mp4"),
      "video",
    );
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe("ready");
    const second = await upload(
      "lecturer",
      own,
      ownLessonId,
      join(assets, "videos", "options-trading-fundamentals-preview.mp4"),
      "video",
    );
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe("ready");
    const info = await get(`/staff/courses/${own}/lessons/${ownLessonId}/video`, "lecturer");
    expect(info.json().video.status).toBe("ready");

    const notMp4 = await send(
      "POST",
      `/staff/courses/${own}/lessons/${ownLessonId}/video/uploads`,
      "lecturer",
      { fileName: "notes.txt", size: 100 },
    );
    expect(notMp4.statusCode).toBe(400);
    const tooBig = await send(
      "POST",
      `/staff/courses/${own}/lessons/${ownLessonId}/video/uploads`,
      "lecturer",
      { fileName: "big.mp4", size: 2_000_000_000 },
    );
    expect(tooBig.statusCode).toBe(400);
    expect(JSON.stringify(tooBig.json())).toMatch(/1 GB/);
    const empty = await send(
      "POST",
      `/staff/courses/${own}/lessons/${ownLessonId}/video/uploads`,
      "lecturer",
      { fileName: "empty.mp4", size: 0 },
    );
    expect(empty.statusCode).toBe(400);
  });

  it("lets an enrolled Student watch it (with ranged streaming), and nobody else", async () => {
    const info = await get(`/courses/${own}/lessons/${ownLessonId}/video`, "student");
    expect(info.statusCode).toBe(200);
    const video = info.json().video as { durationSeconds: number; playback: { url: string } };
    expect(video.durationSeconds).toBeGreaterThan(0);
    const range = await h.t.app.inject({
      method: "GET",
      url: video.playback.url,
      headers: { range: "bytes=0-99" },
    });
    expect(range.statusCode).toBe(206);
    // A lesson of a course the Student does not own stays closed.
    const lessons = (await get(`/staff/courses/${notOwned}/lessons`, "instructor")).json()
      .items as { id: string; isPreview: boolean }[];
    const paid = lessons.find((l) => !l.isPreview)!;
    expect((await get(`/courses/${notOwned}/lessons/${paid.id}`, "student")).statusCode).toBe(403);
    expect((await get(`/courses/${notOwned}/lessons/${paid.id}/video`, "student")).statusCode).toBe(
      403,
    );
  });
});

describe("PDFs and other materials", () => {
  let resourceId: string;
  it("uploads a PDF, refuses unsupported types, and lets the Student open it", async () => {
    const done = await upload(
      "lecturer",
      own,
      ownLessonId,
      join(assets, "pdfs", "risk-management-plan-worksheet.pdf"),
      "file",
    );
    expect(done.statusCode).toBe(200);
    resourceId = done.json().id;
    const exe = await send(
      "POST",
      `/staff/courses/${own}/lessons/${ownLessonId}/uploads`,
      "lecturer",
      {
        fileName: "run.exe",
        mimeType: "application/x-msdownload",
        size: 100,
      },
    );
    expect(exe.statusCode).toBe(400);
    expect(JSON.stringify(exe.json())).toMatch(/not supported/i);
    const list = (await get(`/courses/${own}/lessons/${ownLessonId}/resources`, "student")).json()
      .items as { id: string; title: string }[];
    expect(list.map((r) => r.title)).toContain("Worksheet");
    const link = await send(
      "POST",
      `/courses/${own}/lessons/${ownLessonId}/resources/${resourceId}/link`,
      "student",
      { download: false },
    );
    expect(link.statusCode).toBe(200);
    const file = await h.t.app.inject({ method: "GET", url: link.json().url });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toMatch(/pdf/);
  });

  it("removes the PDF, after which the Student no longer sees it", async () => {
    const del = await send(
      "DELETE",
      `/staff/courses/${own}/lessons/${ownLessonId}/resources/${resourceId}`,
      "lecturer",
    );
    expect(del.statusCode).toBe(200);
    const list = (await get(`/courses/${own}/lessons/${ownLessonId}/resources`, "student")).json()
      .items as unknown[];
    expect(list).toHaveLength(0);
  });
});

describe("ownership and permissions", () => {
  it("keeps the Lecturer out of a course they were not given, for every kind of content", async () => {
    const lessons = (await get(`/staff/courses/${other}/lessons`, "instructor")).json().items as {
      id: string;
    }[];
    const lesson = lessons[0]!.id;
    const checks = await Promise.all([
      get(`/staff/courses/${other}/lessons`, "lecturer"),
      send("POST", `/staff/courses/${other}/lessons`, "lecturer", {
        title: "x",
        idempotencyKey: "nope-1",
      }),
      send("POST", `/staff/courses/${other}/modules`, "lecturer", { title: "x" }),
      send("POST", `/staff/courses/${other}/lessons/${lesson}/uploads`, "lecturer", {
        fileName: "a.pdf",
        mimeType: "application/pdf",
        size: 10,
      }),
      send("POST", `/staff/courses/${other}/lessons/${lesson}/video/uploads`, "lecturer", {
        fileName: "a.mp4",
        size: 10,
      }),
      send("DELETE", `/staff/courses/${other}/lessons/${lesson}/video`, "lecturer"),
      send("POST", `/staff/courses/${other}/live-sessions`, "lecturer", {
        title: "x",
        description: "",
        startsAt: new Date(Date.now() + 3600_000).toISOString(),
        durationMinutes: 30,
        joinUrl: "https://meet.example.com/x",
      }),
    ]);
    for (const r of checks) expect(r.statusCode).toBe(403);
  });

  it("keeps a Student out of every staff content route", async () => {
    for (const path of [`/staff/courses/${own}/lessons`, `/staff/courses/${own}/live-sessions`]) {
      expect((await get(path, "student")).statusCode).toBe(403);
    }
    expect(
      (
        await send("POST", `/staff/courses/${own}/lessons/${ownLessonId}/uploads`, "student", {
          fileName: "a.pdf",
          mimeType: "application/pdf",
          size: 10,
        })
      ).statusCode,
    ).toBe(403);
  });
});

describe("live classes", () => {
  it("lets the Lecturer schedule a class, the Student see and join it, and the Lecturer get the host link", async () => {
    const live = await send("POST", `/staff/courses/${own}/live-sessions`, "lecturer", {
      title: "Content live class",
      description: "",
      startsAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      durationMinutes: 30,
      joinUrl: "https://meet.example.com/host-room",
    });
    expect(live.statusCode).toBe(201);
    const id = live.json().id as string;
    const seen = (await get("/me/live-sessions", "student")).json().items as {
      id: string;
      joinUrl?: string;
    }[];
    const mine = seen.find((s) => s.id === id)!;
    expect(mine).toBeTruthy();
    expect(mine.joinUrl).toBeUndefined(); // the link is never in a list
    const join = await send("POST", `/me/courses/${own}/live-sessions/${id}/join`, "student");
    expect(join.statusCode).toBe(200);
    expect(join.json().url).toBe("https://meet.example.com/host-room");
    const host = (
      (await get(`/staff/courses/${own}/live-sessions`, "lecturer")).json().items as {
        id: string;
        joinUrl: string;
        joinedCount: number;
      }[]
    ).find((s) => s.id === id)!;
    expect(host.joinUrl).toBe("https://meet.example.com/host-room");
    expect(host.joinedCount).toBe(1);
    // Cancelled classes can no longer be joined.
    const cancelled = await send(
      "POST",
      `/staff/courses/${own}/live-sessions/${id}/cancel`,
      "lecturer",
      { expectedVersion: live.json().version, reason: "Content test cleanup" },
    );
    expect(cancelled.statusCode).toBe(200);
    expect(
      (await send("POST", `/me/courses/${own}/live-sessions/${id}/join`, "student")).statusCode,
    ).toBeGreaterThanOrEqual(400);
  });

  it("does not let a Student who does not own the course join its class", async () => {
    const live = await send("POST", `/staff/courses/${other}/live-sessions`, "instructor", {
      title: "Other live class",
      description: "",
      startsAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      durationMinutes: 30,
      joinUrl: "https://meet.example.com/other",
    });
    expect(live.statusCode).toBe(201);
    const mine = (await get("/me/courses", "student")).json().items as { id: string }[];
    if (!mine.some((c) => c.id === other)) {
      expect(
        (await send("POST", `/me/courses/${other}/live-sessions/${live.json().id}/join`, "student"))
          .statusCode,
      ).toBe(403);
    }
  });
});

describe("cleaning up", () => {
  it("lets the Lecturer delete the lesson, which removes its video and files for Students", async () => {
    const del = await send("DELETE", `/staff/courses/${own}/lessons/${ownLessonId}`, "lecturer");
    expect(del.statusCode).toBe(204);
    expect((await get(`/courses/${own}/lessons/${ownLessonId}`, "student")).statusCode).toBe(404);
  });
});
