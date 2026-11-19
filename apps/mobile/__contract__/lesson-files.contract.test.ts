import * as SecureStore from "expo-secure-store";
import { apiBaseUrl } from "../src/api/client";
import { AppError } from "../src/api/errors";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { staffCourseApi } from "../src/courses/course-api";
import { staffEntitlementApi } from "../src/entitlements/entitlement-api";
import { instructorApi } from "../src/instructors/instructor-api";
import { staffLessonApi } from "../src/lessons/lesson-api";
import { resourceApi, staffResourceApi } from "../src/resources/resource-api";
import { fileReader, uploadFile } from "../src/resources/upload";
import { sessionStore } from "../src/session/session-store";
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
const failure = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error("expected a failure");
};

describe("Lesson files against the real API", () => {
  it("staff upload in parts; owners read through short links; strangers and downloads are refused", async () => {
    const adminEmail = await newAccount();
    const ownerEmail = await newAccount();
    const strangerEmail = await newAccount();
    makeAdmin(adminEmail);
    // A real PDF header followed by 6 MB, so the upload needs two parts.
    const bytes = new Uint8Array(6 * 1024 * 1024 + 7).fill(0x41);
    bytes.set(new TextEncoder().encode("%PDF-1.7\n"), 0);
    jest
      .spyOn(fileReader, "readPart")
      .mockImplementation(async (_u, offset, length) => bytes.slice(offset, offset + length));

    await signInAs(adminEmail);
    const course = await staffCourseApi.create({
      title: "Files contract course",
      description: "A complete description.",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    });
    const lesson = await staffLessonApi.create(course.id, {
      title: "With a file",
      idempotencyKey: `k-${Date.now()}`,
    });
    await staffCourseApi.publish(course.id);
    const progress: number[] = [];
    const saved = await uploadFile({
      courseId: course.id,
      lessonId: lesson.id,
      uri: "file://contract.pdf",
      fileName: "Week 1.pdf",
      mimeType: "application/pdf",
      size: bytes.length,
      title: "Week 1 notes",
      onProgress: (p) => progress.push(p),
    });
    expect(progress).toEqual([0, 50, 100]);
    expect(saved).toMatchObject({
      title: "Week 1 notes",
      sizeBytes: bytes.length,
      downloadable: false,
    });
    expect((await staffResourceApi.list(course.id, lesson.id)).map((r) => r.id)).toEqual([
      saved.id,
    ]);
    const owner = await instructorApi.lookup(ownerEmail);
    await staffEntitlementApi.grant(course.id, owner.id, "Paid by invoice");

    await signInAs(strangerEmail);
    expect((await failure(resourceApi.list(course.id, lesson.id))).kind).toBe("forbidden");
    expect((await failure(staffResourceApi.list(course.id, lesson.id))).kind).toBe("forbidden");

    await signInAs(ownerEmail);
    const files = await resourceApi.list(course.id, lesson.id);
    expect(files.map((f) => f.title)).toEqual(["Week 1 notes"]);
    const link = await resourceApi.link(course.id, lesson.id, saved.id, false);
    const res = await realFetch(`${apiBaseUrl()}${link.url}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const got = new Uint8Array(await res.arrayBuffer());
    expect(got.length).toBe(bytes.length);
    expect(got.slice(0, 8)).toEqual(bytes.slice(0, 8));
    const refused = await failure(resourceApi.link(course.id, lesson.id, saved.id, true));
    expect([refused.kind, refused.code]).toEqual(["forbidden", "DOWNLOAD_NOT_ALLOWED"]);
  }, 120_000);
});
