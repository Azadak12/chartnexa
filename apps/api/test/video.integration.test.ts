import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  UPLOAD_PART_BYTES,
  type LessonVideo,
  type StaffVideo,
  type UploadSession,
  type VideoProgress,
} from "@chartnexa/api-contracts";
import { CoursesService } from "../src/modules/courses/index.js";
import { ResourcesService } from "../src/modules/resources/index.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let dir: string;
let admin: Person;
let manager: Person;
let courses: CoursesService;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  dir = await mkdtemp(join(tmpdir(), "chartnexa-video-"));
  h = await makeHarness(db.url, { STORAGE_DIR: dir });
  courses = h.t.app.get(CoursesService);
  admin = await person(h, "admin");
  manager = await person(h, "manager");
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
  await rm(dir, { recursive: true, force: true });
});

const box = (type: string, body: Buffer) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, body]);
};
/** A minimal MP4: ftyp, moov with an mvhd (timescale 1000), and padding as media data. */
const mp4 = (seconds: number, padding = 1000, withMvhd = true) => {
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12);
  mvhd.writeUInt32BE(seconds * 1000, 16);
  return Buffer.concat([
    box("ftyp", Buffer.from("isom\0\0\x02\0isomiso2mp41", "latin1")),
    box("moov", withMvhd ? box("mvhd", mvhd) : box("free", Buffer.alloc(10))),
    box("mdat", Buffer.alloc(padding, 7)),
  ]);
};

type M = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const call = (
  p: Person | undefined,
  method: M,
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
) =>
  h.call(method, url, {
    ...(p ? { token: p.accessToken } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(headers ? { headers } : {}),
  });
const putPart = (p: Person, c: string, id: string, n: number, data: Buffer) =>
  h.t.app.inject({
    method: "PUT",
    url: `/staff/courses/${c}/uploads/${id}/parts/${n}`,
    headers: {
      authorization: `Bearer ${p.accessToken}`,
      "content-type": "application/octet-stream",
    },
    payload: data,
  });
const mkCourse = async () => {
  const c = await courses.create(
    admin.id,
    {
      title: "Video course",
      description: "A complete description",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    } as never,
    "rq",
  );
  return courses.publish(admin.id, c.id, "rp");
};
const mkLesson = async (courseId: string, isPreview = false) =>
  (
    await call(manager, "POST", `/staff/courses/${courseId}/lessons`, {
      title: "Watch this",
      idempotencyKey: randomUUID(),
      isPreview,
    })
  ).json() as { id: string };
const uploadVideo = async (
  c: string,
  l: string,
  data: Buffer,
  who = manager,
  fileName = "lesson.mp4",
) => {
  const start = await call(who, "POST", `/staff/courses/${c}/lessons/${l}/video/uploads`, {
    fileName,
    size: data.length,
  });
  expect(start.statusCode).toBe(200);
  const s = start.json() as UploadSession;
  for (let n = 1; n <= s.partCount; n++) {
    expect(
      (await putPart(who, c, s.uploadId, n, data.subarray((n - 1) * s.partSize, n * s.partSize)))
        .statusCode,
    ).toBe(200);
  }
  return {
    s,
    res: await call(who, "POST", `/staff/courses/${c}/uploads/${s.uploadId}/complete-video`),
  };
};
const owner = async (courseId: string) => {
  const p = await person(h);
  await h.db.entitlement.create({
    data: { userId: p.id, courseId, source: "admin_grant", grantReason: "Test grant" },
  });
  return p;
};
const beat = (
  p: Person,
  c: string,
  l: string,
  positionSeconds: number,
  watchedDeltaSeconds: number,
) =>
  call(p, "PUT", `/me/courses/${c}/lessons/${l}/video-progress`, {
    positionSeconds,
    watchedDeltaSeconds,
  });
/** Pretends the last report was `seconds` ago. */
const age = (p: Person, l: string, seconds: number) =>
  h.db
    .$executeRaw`UPDATE video_progress SET last_beat_at = now() - make_interval(secs => ${seconds})
    WHERE user_id = ${p.id}::uuid AND lesson_id = ${l}::uuid`;
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

describe("uploading a lesson video", () => {
  it("joins the parts, reads the length, and makes it the lesson's video, audited", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    const data = mp4(600, UPLOAD_PART_BYTES + 100);
    const { s, res } = await uploadVideo(c.id, l.id, data);
    expect(s.partCount).toBe(2);
    expect(res.statusCode).toBe(200);
    const v = res.json() as StaffVideo;
    expect(v).toMatchObject({
      status: "ready",
      provider: "test",
      durationSeconds: 600,
      sizeBytes: data.length,
    });
    expect((await files()).some((f) => f.includes(s.uploadId))).toBe(false);
    expect(await auditRows(h, { action: "video.create", targetId: v.id })).toHaveLength(1);
    const again = await call(
      manager,
      "POST",
      `/staff/courses/${c.id}/uploads/${s.uploadId}/complete-video`,
    );
    expect((again.json() as StaffVideo).id).toBe(v.id);
    expect(
      (await call(manager, "GET", `/staff/courses/${c.id}/lessons/${l.id}/video`)).json(),
    ).toMatchObject({ video: { id: v.id } });
  });

  it("refuses a file that is not an MP4 or has no readable length, keeping the earlier video", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    const first = (await uploadVideo(c.id, l.id, mp4(60))).res.json() as StaffVideo;
    const notMp4 = await uploadVideo(
      c.id,
      l.id,
      Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.alloc(100)]),
    );
    expect(notMp4.res.statusCode).toBe(400);
    expect(JSON.stringify(notMp4.res.json())).toContain("not an MP4");
    const noLength = await uploadVideo(c.id, l.id, mp4(60, 100, false));
    expect(noLength.res.statusCode).toBe(400);
    expect(JSON.stringify(noLength.res.json())).toContain("length could not be read");
    expect(
      (await call(manager, "GET", `/staff/courses/${c.id}/lessons/${l.id}/video`)).json(),
    ).toMatchObject({ video: { id: first.id, durationSeconds: 60 } });
  });

  it("validates the start request and keeps file and video uploads apart", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    const start = (body: unknown) =>
      call(manager, "POST", `/staff/courses/${c.id}/lessons/${l.id}/video/uploads`, body);
    expect((await start({ fileName: "a.mov", size: 10 })).statusCode).toBe(400);
    expect((await start({ fileName: "a.mp4", size: 1024 * 1024 * 1024 + 1 })).statusCode).toBe(400);
    const vs = (await start({ fileName: "a.mp4", size: 100 })).json() as UploadSession;
    const asFile = await call(
      manager,
      "POST",
      `/staff/courses/${c.id}/uploads/${vs.uploadId}/complete`,
      { title: "x" },
    );
    expect(asFile.statusCode).toBe(400);
    const fs = (
      await call(manager, "POST", `/staff/courses/${c.id}/lessons/${l.id}/uploads`, {
        fileName: "a.pdf",
        mimeType: "application/pdf",
        size: 10,
      })
    ).json() as UploadSession;
    expect(
      (await call(manager, "POST", `/staff/courses/${c.id}/uploads/${fs.uploadId}/complete-video`))
        .statusCode,
    ).toBe(400);
  });

  it("replaces a video, removing the old bytes and restarting everyone's watching", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    await uploadVideo(c.id, l.id, mp4(100));
    const p = await owner(c.id);
    await beat(p, c.id, l.id, 3, 3);
    const oldRef = (await h.db.lessonVideo.findUniqueOrThrow({ where: { lessonId: l.id } }))
      .providerRef!;
    const replaced = (await uploadVideo(c.id, l.id, mp4(200))).res.json() as StaffVideo;
    expect(replaced).toMatchObject({ durationSeconds: 200, version: 2 });
    expect((await files()).some((f) => f.endsWith(oldRef.split("/").pop()!))).toBe(false);
    expect(await h.db.videoProgress.count({ where: { lessonId: l.id } })).toBe(0);
  });

  it("is limited to people who may author the course's lessons", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    const student = await person(h);
    const body = { fileName: "a.mp4", size: 100 };
    expect(
      (await call(student, "POST", `/staff/courses/${c.id}/lessons/${l.id}/video/uploads`, body))
        .statusCode,
    ).toBe(403);
    expect(
      (await call(student, "GET", `/staff/courses/${c.id}/lessons/${l.id}/video`)).statusCode,
    ).toBe(403);
    expect(
      (await call(student, "DELETE", `/staff/courses/${c.id}/lessons/${l.id}/video`)).statusCode,
    ).toBe(403);
    const teacher = await person(h, "instructor");
    await h.db.instructorGrant.create({
      data: {
        userId: teacher.id,
        permission: "lesson:upload",
        courseId: c.id,
        reason: "Test grant",
      },
    });
    expect((await uploadVideo(c.id, l.id, mp4(30), teacher)).res.statusCode).toBe(200);
  });
});

describe("watching", () => {
  const setup = async (isPreview = false, seconds = 600) => {
    const c = await mkCourse();
    const l = await mkLesson(c.id, isPreview);
    const data = mp4(seconds, 5000);
    const v = (await uploadVideo(c.id, l.id, data)).res.json() as StaffVideo;
    return { c, l, v, data };
  };

  it("gives owners a playback link and their progress; strangers on locked lessons are refused", async () => {
    const { c, l } = await setup();
    const p = await owner(c.id);
    const res = (await call(p, "GET", `/courses/${c.id}/lessons/${l.id}/video`)).json() as {
      video: LessonVideo;
    };
    expect(res.video).toMatchObject({
      durationSeconds: 600,
      progress: { positionSeconds: 0, watchedSeconds: 0, completed: false, requiredSeconds: 540 },
    });
    expect(res.video.playback.url).toMatch(/^\/videos\/[0-9a-f-]+\/stream\?t=/);
    expect(
      (await call(await person(h), "GET", `/courses/${c.id}/lessons/${l.id}/video`)).statusCode,
    ).toBe(403);
    expect(
      (await call(undefined, "GET", `/courses/${c.id}/lessons/${l.id}/video`)).statusCode,
    ).toBe(403);
  });

  it("shows a free-preview lesson's video to anyone, without progress", async () => {
    const { c, l } = await setup(true);
    const res = (await call(undefined, "GET", `/courses/${c.id}/lessons/${l.id}/video`)).json() as {
      video: LessonVideo;
    };
    expect(res.video.progress).toBeNull();
    expect((await h.call("GET", res.video.playback.url)).statusCode).toBe(200);
  });

  it("serves the bytes whole or by range, and refuses bad links and ranges", async () => {
    const { c, l, data } = await setup();
    const p = await owner(c.id);
    const url = (
      (await call(p, "GET", `/courses/${c.id}/lessons/${l.id}/video`)).json() as {
        video: LessonVideo;
      }
    ).video.playback.url;
    const whole = await h.call("GET", url);
    expect(whole.statusCode).toBe(200);
    expect(whole.headers["accept-ranges"]).toBe("bytes");
    expect(whole.rawPayload.equals(data)).toBe(true);
    const part = await h.call("GET", url, { headers: { range: "bytes=10-19" } });
    expect(part.statusCode).toBe(206);
    expect(part.headers["content-range"]).toBe(`bytes 10-19/${data.length}`);
    expect(part.rawPayload.equals(data.subarray(10, 20))).toBe(true);
    const tail = await h.call("GET", url, { headers: { range: "bytes=-5" } });
    expect(tail.rawPayload.equals(data.subarray(data.length - 5))).toBe(true);
    expect(
      (await h.call("GET", url, { headers: { range: `bytes=${data.length}-` } })).statusCode,
    ).toBe(416);
    const id = url.split("/")[2]!;
    expect((await h.call("GET", `/videos/${id}/stream`)).statusCode).toBe(404);
    expect((await h.call("GET", `/videos/${id}/stream?t=forged.token`)).statusCode).toBe(404);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 5 * 60 * 60 * 1000);
      expect((await h.call("GET", url)).statusCode).toBe(404);
    } finally {
      vi.useRealTimers();
    }
  });

  it("caps watched time by real elapsed time and completes the lesson at 90 percent, once", async () => {
    const { c, l } = await setup();
    const p = await owner(c.id);
    // A first report cannot claim more than a few seconds.
    expect(((await beat(p, c.id, l.id, 300, 600)).json() as VideoProgress).watchedSeconds).toBe(5);
    // Repeating inflated reports with no time passing barely moves it.
    for (let i = 0; i < 5; i++) await beat(p, c.id, l.id, 300, 600);
    const inflated = (await beat(p, c.id, l.id, 300, 600)).json() as VideoProgress;
    expect(inflated.watchedSeconds).toBeLessThanOrEqual(5 + 6 * 6);
    expect(inflated.completed).toBe(false);
    // Real watching, reported every five minutes.
    for (let i = 0; i < 2; i++) {
      await age(p, l.id, 300);
      await beat(p, c.id, l.id, 300 * (i + 1), 300);
    }
    const done = (await beat(p, c.id, l.id, 610, 0)).json() as VideoProgress;
    expect(done).toMatchObject({ completed: true, positionSeconds: 600 });
    expect(done.watchedSeconds).toBeGreaterThanOrEqual(540);
    expect(await h.db.lessonCompletion.count({ where: { userId: p.id, lessonId: l.id } })).toBe(1);
    await age(p, l.id, 300);
    await beat(p, c.id, l.id, 600, 300);
    expect(await h.db.lessonCompletion.count({ where: { userId: p.id, lessonId: l.id } })).toBe(1);
    const progress = (await call(p, "GET", `/me/courses/${c.id}/progress`)).json() as {
      completed: number;
    };
    expect(progress.completed).toBe(1);
  });

  it("keeps simultaneous reports from adding up beyond the cap", async () => {
    const { c, l } = await setup();
    const p = await owner(c.id);
    await beat(p, c.id, l.id, 0, 0);
    await Promise.all(Array.from({ length: 8 }, () => beat(p, c.id, l.id, 10, 300)));
    const row = await h.db.videoProgress.findUniqueOrThrow({
      where: { userId_lessonId: { userId: p.id, lessonId: l.id } },
    });
    expect(row.watchedSeconds).toBeLessThanOrEqual(8 * 6 + 5);
  });

  it("never counts more watched time than the video lasts", async () => {
    const { c, l } = await setup(false, 10);
    const p = await owner(c.id);
    await beat(p, c.id, l.id, 0, 0);
    await age(p, l.id, 300);
    const out = (await beat(p, c.id, l.id, 999, 300)).json() as VideoProgress;
    expect([out.watchedSeconds, out.positionSeconds]).toEqual([10, 10]);
  });

  it("does not lose watched time when two reports arrive together", async () => {
    const { c, l } = await setup();
    const p = await owner(c.id);
    await beat(p, c.id, l.id, 0, 0);
    await age(p, l.id, 300);
    await Promise.all([beat(p, c.id, l.id, 150, 150), beat(p, c.id, l.id, 150, 150)]);
    const row = await h.db.videoProgress.findUniqueOrThrow({
      where: { userId_lessonId: { userId: p.id, lessonId: l.id } },
    });
    // One report takes its 150 s; the other, seeing no time pass since, may add only the slack.
    expect(row.watchedSeconds).toBeGreaterThan(150);
    expect(row.watchedSeconds).toBeLessThanOrEqual(160);
  });

  it("records progress for owners only, and only for lessons with a video", async () => {
    const { c, l } = await setup();
    expect((await beat(await person(h), c.id, l.id, 1, 1)).statusCode).toBe(403);
    const p = await owner(c.id);
    const plain = await mkLesson(c.id);
    expect((await beat(p, c.id, plain.id, 1, 1)).statusCode).toBe(404);
    for (const body of [
      { positionSeconds: -1, watchedDeltaSeconds: 1 },
      { positionSeconds: 1, watchedDeltaSeconds: 601 },
      { positionSeconds: 1 },
    ]) {
      expect(
        (await call(p, "PUT", `/me/courses/${c.id}/lessons/${l.id}/video-progress`, body))
          .statusCode,
      ).toBe(400);
    }
  });

  it("refuses a manual completion for a video lesson but still allows undoing one", async () => {
    const { c, l } = await setup();
    const p = await owner(c.id);
    const res = await call(p, "PUT", `/me/courses/${c.id}/lessons/${l.id}/completion`);
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe("VIDEO_LESSON");
    expect(
      (await call(p, "DELETE", `/me/courses/${c.id}/lessons/${l.id}/completion`)).statusCode,
    ).toBe(200);
    const plain = await mkLesson(c.id);
    expect(
      (await call(p, "PUT", `/me/courses/${c.id}/lessons/${plain.id}/completion`)).statusCode,
    ).toBe(200);
  });
});

describe("removing and cleaning up", () => {
  it("removes a video with its progress and bytes; completions stay; removing again succeeds", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    await uploadVideo(c.id, l.id, mp4(10));
    const ref = (await h.db.lessonVideo.findUniqueOrThrow({ where: { lessonId: l.id } }))
      .providerRef!;
    const p = await owner(c.id);
    await beat(p, c.id, l.id, 5, 5);
    await age(p, l.id, 60);
    await beat(p, c.id, l.id, 10, 10);
    expect(await h.db.lessonCompletion.count({ where: { lessonId: l.id } })).toBe(1);
    expect(
      (await call(manager, "DELETE", `/staff/courses/${c.id}/lessons/${l.id}/video`)).json(),
    ).toEqual({ deleted: true });
    expect(
      (await call(manager, "DELETE", `/staff/courses/${c.id}/lessons/${l.id}/video`)).json(),
    ).toEqual({ deleted: false });
    expect(await h.db.videoProgress.count({ where: { lessonId: l.id } })).toBe(0);
    expect(await h.db.lessonCompletion.count({ where: { lessonId: l.id } })).toBe(1);
    expect((await files()).some((f) => f.endsWith(ref.split("/").pop()!))).toBe(false);
    expect((await call(p, "GET", `/courses/${c.id}/lessons/${l.id}/video`)).json()).toEqual({
      video: null,
    });
  });

  it("cleans up a deleted lesson's video bytes after the grace period", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    await uploadVideo(c.id, l.id, mp4(10));
    const ref = (await h.db.lessonVideo.findUniqueOrThrow({ where: { lessonId: l.id } }))
      .providerRef!;
    await call(manager, "DELETE", `/staff/courses/${c.id}/lessons/${l.id}`);
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(join(dir, ref), old, old);
    await h.t.app.get(ResourcesService).cleanup();
    expect((await files()).some((f) => f.endsWith(ref.split("/").pop()!))).toBe(false);
  });

  it("deletes a person's watch progress with their account", async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    await uploadVideo(c.id, l.id, mp4(100));
    const p = await owner(c.id);
    await beat(p, c.id, l.id, 3, 3);
    const del = await h.call("DELETE", "/me", {
      token: p.accessToken,
      body: { password: p.password },
    });
    expect(del.statusCode).toBeLessThan(300);
    expect(await h.db.videoProgress.count({ where: { userId: p.id } })).toBe(0);
  });
});
