import * as SecureStore from "expo-secure-store";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { courseApi, staffCourseApi } from "../src/courses/course-api";
import { staffEntitlementApi } from "../src/entitlements/entitlement-api";
import { instructorApi } from "../src/instructors/instructor-api";
import { lessonApi, staffLessonApi } from "../src/lessons/lesson-api";
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
const key = () => `contract-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("Course modules against the real API", () => {
  it("staff group lessons into modules; students see the same order and Continue follows it", async () => {
    const adminEmail = await newAccount();
    const ownerEmail = await newAccount();
    makeAdmin(adminEmail);

    await signInAs(adminEmail);
    const course = await staffCourseApi.create({
      title: "Modules contract course",
      description: "A complete description.",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    });
    await staffLessonApi.addModule(course.id, "Part one");
    let list = await staffLessonApi.addModule(course.id, "Part two");
    const [one, two] = list.modules;
    const late = await staffLessonApi.create(course.id, {
      title: "Later",
      idempotencyKey: key(),
      moduleId: two!.id,
    });
    await staffLessonApi.create(course.id, {
      title: "Early",
      idempotencyKey: key(),
      moduleId: one!.id,
    });
    const intro = await staffLessonApi.create(course.id, { title: "Intro", idempotencyKey: key() });
    list = await staffLessonApi.list(course.id);
    expect(list.items.map((l) => l.title)).toEqual(["Intro", "Early", "Later"]);
    list = await staffLessonApi.reorderModules(course.id, [two!.id, one!.id]);
    expect(list.items.map((l) => l.title)).toEqual(["Intro", "Later", "Early"]);
    list = await staffLessonApi.moveToModule(course.id, intro.id, one!.id);
    expect(list.items.map((l) => l.title)).toEqual(["Later", "Early", "Intro"]);
    await staffCourseApi.publish(course.id);
    const owner = await instructorApi.lookup(ownerEmail);
    await staffEntitlementApi.grant(course.id, owner.id, "Paid by invoice");

    await signInAs(ownerEmail);
    const outline = await lessonApi.outline(course.id);
    expect(outline.items.map((l) => l.title)).toEqual(["Later", "Early", "Intro"]);
    expect(outline.modules.map((m) => m.title)).toEqual(["Part two", "Part one"]);
    expect((await courseApi.get(course.id)).nextLessonId).toBe(late.id);
    await progressApi.mark(course.id, late.id);
    expect((await courseApi.get(course.id)).nextLessonId).not.toBe(late.id);
  });
});
