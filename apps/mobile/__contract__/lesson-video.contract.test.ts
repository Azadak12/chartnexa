import * as SecureStore from "expo-secure-store";
import { apiBaseUrl } from "../src/api/client";
import { AppError } from "../src/api/errors";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { staffCourseApi } from "../src/courses/course-api";
import { staffEntitlementApi } from "../src/entitlements/entitlement-api";
import { instructorApi } from "../src/instructors/instructor-api";
import { staffLessonApi } from "../src/lessons/lesson-api";
import { progressApi } from "../src/progress/progress-api";
import { fileReader } from "../src/resources/upload";
import { sessionStore } from "../src/session/session-store";
import { uploadVideo, videoApi } from "../src/video/video-api";
import {
  GOOD_PASSWORD,
  loginAny,
  makeAdmin,
  realFetch,
  uniqueEmail,
  waitForToken,
} from "./helpers";

const secure = SecureStore as unknown as { __reset: () => void };
beforeAll(() => {
  process.env.EXPO_PUBLIC_API_BASE_URL = process.env.CONTRACT_API_URL;
  (globalThis as { fetch: unknown }).fetch = realFetch;
});
afterEach(() => sessionManager._resetForTests());

async function newAccount(): Promise<string> {
  const email = uniqueEmail();
  await authHttp.register({ email, password: GOOD_PASSWORD });
  await authHttp.verifyEmail(await waitForToken(email, "Verify your ChartNexa email"));
  return email;
}
async function signInAs(email: string): Promise<void> {
  secure.__reset();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(await loginAny(email, GOOD_PASSWORD));
}
const box = (type: string, body: Uint8Array) => {
  const out = new Uint8Array(8 + body.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  return out;
};
const concat = (...xs: Uint8Array[]) => {
  const out = new Uint8Array(xs.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of xs) {
    out.set(x, o);
    o += x.length;
  }
  return out;
};

describe("Lesson video against the real API", () => {
  it("staff upload an MP4; the owner plays it by range, reports watching, and cannot mark it by hand", async () => {
    const adminEmail = await newAccount();
    const ownerEmail = await newAccount();
    makeAdmin(adminEmail);
    const mvhd = new Uint8Array(100);
    new DataView(mvhd.buffer).setUint32(12, 1000);
    new DataView(mvhd.buffer).setUint32(16, 120_000); // 2 minutes
    const bytes = concat(
      box("ftyp", new Uint8Array(8)),
      box("moov", box("mvhd", mvhd)),
      box("mdat", new Uint8Array(5 * 1024 * 1024 + 50)),
    );
    jest
      .spyOn(fileReader, "readPart")
      .mockImplementation(async (_u, offset, length) => bytes.slice(offset, offset + length));

    await signInAs(adminEmail);
    const course = await staffCourseApi.create({
      title: "Video contract course",
      description: "A complete description.",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    });
    const lesson = await staffLessonApi.create(course.id, {
      title: "Watch",
      idempotencyKey: `k-${Date.now()}`,
    });
    await staffCourseApi.publish(course.id);
    const saved = await uploadVideo({
      courseId: course.id,
      lessonId: lesson.id,
      uri: "file://v.mp4",
      fileName: "v.mp4",
      size: bytes.length,
    });
    expect(saved).toMatchObject({ status: "ready", durationSeconds: 120 });
    const owner = await instructorApi.lookup(ownerEmail);
    await staffEntitlementApi.grant(course.id, owner.id, "Paid by invoice");

    await signInAs(ownerEmail);
    const v = await videoApi.get(course.id, lesson.id);
    expect(v).toMatchObject({
      durationSeconds: 120,
      progress: { watchedSeconds: 0, completed: false, requiredSeconds: 108 },
    });
    const res = await realFetch(`${apiBaseUrl()}${v!.playback.url}`, {
      headers: { range: "bytes=0-15" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 0-15/${bytes.length}`);
    const first = await videoApi.report(course.id, lesson.id, 30, 30);
    expect(first.watchedSeconds).toBeLessThanOrEqual(5);
    let refused: AppError | null = null;
    try {
      await progressApi.mark(course.id, lesson.id);
    } catch (e) {
      refused = e as AppError;
    }
    expect([refused?.kind, refused?.code]).toEqual(["conflict", "VIDEO_LESSON"]);
  }, 120_000);
});
