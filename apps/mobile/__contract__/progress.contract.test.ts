import * as SecureStore from "expo-secure-store";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { AppError } from "../src/api/errors";
import { courseApi, staffCourseApi } from "../src/courses/course-api";
import { myCoursesApi, staffEntitlementApi } from "../src/entitlements/entitlement-api";
import { instructorApi } from "../src/instructors/instructor-api";
import { lessonApi, staffLessonApi } from "../src/lessons/lesson-api";
import { progressApi } from "../src/progress/progress-api";
import { sessionStore } from "../src/session/session-store";
import { GOOD_PASSWORD, makeAdmin, realFetch, uniqueEmail, waitForToken } from "./helpers";

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
  await sessionManager.signIn(await authHttp.login({ email, password: GOOD_PASSWORD }));
}
const failure = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error("expected a failure");
};
let n = 0;
const key = () => `contract-key-${Date.now()}-${++n}-abcdef`;

describe("Lesson progress against the real API", () => {
  it("an owner marks, sees progress and the next lesson, unmarks; others and revoked owners are refused", async () => {
    const adminEmail = await newAccount();
    const studentEmail = await newAccount();
    const strangerEmail = await newAccount();
    makeAdmin(adminEmail);

    await signInAs(adminEmail);
    const made = await staffCourseApi.create({
      title: "Progress contract course",
      description: "A complete description.",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    });
    const ids: string[] = [];
    for (const title of ["One", "Two", "Three"]) {
      const l = await staffLessonApi.create(made.id, {
        title,
        body: `Text of ${title}`,
        isPreview: title === "One",
        idempotencyKey: key(),
      });
      ids.push(l.id);
    }
    await staffCourseApi.publish(made.id);
    const student = await instructorApi.lookup(studentEmail);
    await staffEntitlementApi.grant(made.id, student.id, "Paid by invoice");

    // Not an owner: refused, and nothing is revealed about which lessons exist.
    await signInAs(strangerEmail);
    expect((await failure(progressApi.mark(made.id, ids[0]!))).kind).toBe("forbidden");
    expect((await failure(progressApi.read(made.id))).kind).toBe("forbidden");
    expect((await courseApi.get(made.id)).progress).toBeNull();

    // The owner starts at 0 of 3, with the first lesson next.
    await signInAs(studentEmail);
    expect(await progressApi.read(made.id)).toMatchObject({
      completed: 0,
      total: 3,
      nextLessonId: ids[0],
    });
    const first = await progressApi.mark(made.id, ids[0]!);
    expect(first.completed).toBe(true);
    const again = await progressApi.mark(made.id, ids[0]!);
    expect(again).toEqual(first);
    await progressApi.mark(made.id, ids[2]!);
    expect(await progressApi.read(made.id)).toMatchObject({
      completed: 2,
      total: 3,
      nextLessonId: ids[1],
    });
    const detail = await courseApi.get(made.id);
    expect(detail).toMatchObject({
      enrolled: true,
      progress: { completed: 2, total: 3 },
      nextLessonId: ids[1],
    });
    const listed = await myCoursesApi.list();
    expect(listed.items[0]?.progress).toEqual({ completed: 2, total: 3 });

    // Unmarking, and an unknown lesson.
    expect(await progressApi.unmark(made.id, ids[2]!)).toEqual({ completed: false });
    expect((await progressApi.read(made.id)).completed).toBe(1);
    expect(
      (await failure(progressApi.mark(made.id, "00000000-0000-4000-8000-000000000000"))).kind,
    ).toBe("not_found");

    // Staff add a lesson: the total grows; the next lesson is still the first incomplete one.
    await signInAs(adminEmail);
    const added = await staffLessonApi.create(made.id, {
      title: "Four",
      isPreview: false,
      idempotencyKey: key(),
    });
    await signInAs(studentEmail);
    expect(await progressApi.read(made.id)).toMatchObject({
      completed: 1,
      total: 4,
      nextLessonId: ids[1],
    });
    await progressApi.mark(made.id, ids[1]!);
    await progressApi.mark(made.id, ids[2]!);
    await progressApi.mark(made.id, added.id);
    expect(await progressApi.read(made.id)).toMatchObject({
      completed: 4,
      total: 4,
      nextLessonId: null,
    });

    // Revoking access stops reads and writes on the next request; granting again restores marks.
    await signInAs(adminEmail);
    const entitlement = (await staffEntitlementApi.list(made.id)).items[0]!;
    await staffEntitlementApi.revoke(made.id, entitlement.id, "Chargeback upheld");
    await signInAs(studentEmail);
    expect((await failure(progressApi.read(made.id))).kind).toBe("forbidden");
    expect((await failure(progressApi.unmark(made.id, ids[0]!))).kind).toBe("forbidden");
    await signInAs(adminEmail);
    await staffEntitlementApi.grant(made.id, student.id, "Reinstated");
    await signInAs(studentEmail);
    expect((await progressApi.read(made.id)).completed).toBe(4);
    expect((await lessonApi.get(made.id, ids[1]!)).body).toBe("Text of Two");
  });
});
