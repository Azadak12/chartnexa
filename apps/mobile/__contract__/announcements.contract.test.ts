import * as SecureStore from "expo-secure-store";
import { AppError } from "../src/api/errors";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { staffCourseApi } from "../src/courses/course-api";
import { staffEntitlementApi } from "../src/entitlements/entitlement-api";
import { instructorApi } from "../src/instructors/instructor-api";
import {
  announcementApi,
  newAnnouncementKey,
  staffAnnouncementApi,
} from "../src/announcements/announcement-api";
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
describe("Announcements against the real API", () => {
  it("a Manager-level poster reaches course owners only; reads are counted; withdrawal hides it", async () => {
    const adminEmail = await newAccount();
    const ownerEmail = await newAccount();
    const otherEmail = await newAccount();
    makeAdmin(adminEmail);
    await signInAs(adminEmail);
    const course = await staffCourseApi.create({
      title: "Announcement contract course",
      description: "A complete description.",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    });
    await staffCourseApi.publish(course.id);
    const owner = await instructorApi.lookup(ownerEmail);
    await staffEntitlementApi.grant(course.id, owner.id, "Paid by invoice");
    const key = newAnnouncementKey();
    const posted = await staffAnnouncementApi.publish({
      title: "Course update",
      body: "A new lesson is up.",
      courseId: course.id,
      idempotencyKey: key,
    });
    const retried = await staffAnnouncementApi.publish({
      title: "Course update",
      body: "A new lesson is up.",
      courseId: course.id,
      idempotencyKey: key,
    });
    expect(retried.id).toBe(posted.id);

    await signInAs(otherEmail);
    expect((await announcementApi.list()).items.map((a) => a.id)).not.toContain(posted.id);
    expect((await failure(staffAnnouncementApi.list())).kind).toBe("forbidden");
    expect((await failure(announcementApi.markRead(posted.id))).kind).toBe("not_found");

    await signInAs(ownerEmail);
    const before = await announcementApi.unread();
    expect((await announcementApi.list()).items.find((a) => a.id === posted.id)).toMatchObject({
      courseTitle: "Announcement contract course",
      read: false,
    });
    await announcementApi.markRead(posted.id);
    expect(await announcementApi.unread()).toBe(before - 1);

    await signInAs(adminEmail);
    expect(
      (await staffAnnouncementApi.list()).items.find((a) => a.id === posted.id)?.readCount,
    ).toBe(1);
    await staffAnnouncementApi.withdraw(posted.id, "Posted early");
    await signInAs(ownerEmail);
    expect((await announcementApi.list()).items.map((a) => a.id)).not.toContain(posted.id);
  }, 120_000);
});
