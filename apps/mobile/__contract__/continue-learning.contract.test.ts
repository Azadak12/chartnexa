import * as SecureStore from "expo-secure-store";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { staffCourseApi } from "../src/courses/course-api";
import { staffEntitlementApi } from "../src/entitlements/entitlement-api";
import { instructorApi } from "../src/instructors/instructor-api";
import { staffLessonApi } from "../src/lessons/lesson-api";
import { continueApi } from "../src/progress/continue-api";
import { progressApi } from "../src/progress/progress-api";
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
describe("Continue learning against the real API", () => {
  it("names the next lesson of the course a student is studying", async () => {
    const adminEmail = await newAccount();
    const studentEmail = await newAccount();
    makeAdmin(adminEmail);
    await signInAs(adminEmail);
    const course = await staffCourseApi.create({
      title: "Continue contract course",
      description: "A complete description.",
      level: "beginner",
      priceCents: 0,
      coverTone: "tint",
    });
    const first = await staffLessonApi.create(course.id, {
      title: "First",
      idempotencyKey: `k-${Date.now()}-1`,
    });
    const second = await staffLessonApi.create(course.id, {
      title: "Second",
      idempotencyKey: `k-${Date.now()}-2`,
    });
    await staffCourseApi.publish(course.id);
    const student = await instructorApi.lookup(studentEmail);

    await signInAs(studentEmail);
    expect(await continueApi.get()).toBeNull();
    await signInAs(adminEmail);
    await staffEntitlementApi.grant(course.id, student.id, "Paid by invoice");
    await signInAs(studentEmail);
    expect(await continueApi.get()).toMatchObject({
      courseId: course.id,
      nextLessonId: first.id,
      completed: 0,
      total: 2,
    });
    await progressApi.mark(course.id, first.id);
    expect(await continueApi.get()).toMatchObject({
      nextLessonId: second.id,
      nextLessonTitle: "Second",
      completed: 1,
    });
    await progressApi.mark(course.id, second.id);
    expect(await continueApi.get()).toBeNull();
  }, 120_000);
});
