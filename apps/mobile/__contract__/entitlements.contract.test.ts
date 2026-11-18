import * as SecureStore from "expo-secure-store";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { AppError } from "../src/api/errors";
import {
  courseApi,
  fetchAccess,
  staffCourseApi,
  canManageEnrollments,
} from "../src/courses/course-api";
import { myCoursesApi, staffEntitlementApi } from "../src/entitlements/entitlement-api";
import { instructorApi } from "../src/instructors/instructor-api";
import { lessonApi, staffLessonApi } from "../src/lessons/lesson-api";
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

/** A request with an explicit token, so the same token can be used before and after a change. */
async function withToken(token: string, path: string): Promise<{ status: number; body: unknown }> {
  const res = await realFetch(`${process.env.CONTRACT_API_URL}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  return { status: res.status, body: await res.json() };
}

describe("Entitlements against the real API", () => {
  it("staff grant and revoke; the owner reads locked lessons and sees My Courses; the same token loses access at once", async () => {
    const adminEmail = await newAccount();
    const studentEmail = await newAccount();
    const strangerEmail = await newAccount();
    makeAdmin(adminEmail);

    // Staff publish a course with a free preview and a locked lesson.
    await signInAs(adminEmail);
    expect(canManageEnrollments(await fetchAccess())).toBe(true);
    const made = await staffCourseApi.create({
      title: "Entitlement contract course",
      description: "A complete description.",
      level: "beginner",
      priceCents: 1000,
      coverTone: "blue",
    });
    const free = await staffLessonApi.create(made.id, {
      title: "Free intro",
      body: "Free text",
      isPreview: true,
      idempotencyKey: key(),
    });
    const locked = await staffLessonApi.create(made.id, {
      title: "Locked lesson",
      body: "OWNER ONLY TEXT",
      isPreview: false,
      idempotencyKey: key(),
    });
    await staffCourseApi.publish(made.id);
    const student = await instructorApi.lookup(studentEmail);

    // The student's session starts before any access exists.
    const studentLogin = await authHttp.login({ email: studentEmail, password: GOOD_PASSWORD });
    const lockedPath = `/courses/${made.id}/lessons/${locked.id}`;
    expect((await withToken(studentLogin.accessToken, lockedPath)).status).toBe(403);
    await signInAs(studentEmail);
    expect((await failure(lessonApi.get(made.id, locked.id))).code).toBe("ENROLLMENT_REQUIRED");
    expect((await myCoursesApi.list()).items).toEqual([]);
    expect((await courseApi.get(made.id)).enrolled).toBe(false);
    expect((await lessonApi.get(made.id, free.id)).body).toBe("Free text");
    // Students and strangers cannot use the staff routes.
    expect((await failure(staffEntitlementApi.list(made.id))).kind).toBe("forbidden");
    expect((await failure(staffEntitlementApi.grant(made.id, student.id, "Trying it"))).kind).toBe(
      "forbidden",
    );

    // Staff give access; repeating it is harmless.
    await signInAs(adminEmail);
    const granted = await staffEntitlementApi.grant(made.id, student.id, "Paid by invoice");
    expect(granted.created).toBe(true);
    expect((await staffEntitlementApi.grant(made.id, student.id, "Again")).created).toBe(false);
    const list = await staffEntitlementApi.list(made.id);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.user.id).toBe(student.id);

    // The very same token that was refused now opens the lesson.
    const after = await withToken(studentLogin.accessToken, lockedPath);
    expect(after.status).toBe(200);
    expect((after.body as { body: string }).body).toBe("OWNER ONLY TEXT");
    await signInAs(studentEmail);
    expect((await lessonApi.get(made.id, locked.id)).body).toBe("OWNER ONLY TEXT");
    expect((await courseApi.get(made.id)).enrolled).toBe(true);
    expect((await myCoursesApi.list()).items.map((c) => [c.id, c.onSale])).toEqual([
      [made.id, true],
    ]);

    // Someone else gets nothing from it.
    await signInAs(strangerEmail);
    expect((await failure(lessonApi.get(made.id, locked.id))).code).toBe("ENROLLMENT_REQUIRED");

    // An unpublished course stays readable for its owner and disappears for everyone else.
    await signInAs(adminEmail);
    await staffCourseApi.unpublish(made.id);
    expect((await withToken(studentLogin.accessToken, lockedPath)).status).toBe(200);
    await signInAs(studentEmail);
    expect((await courseApi.get(made.id)).onSale).toBe(false);
    expect((await myCoursesApi.list()).items[0]?.onSale).toBe(false);
    await signInAs(strangerEmail);
    expect((await failure(courseApi.get(made.id))).kind).toBe("not_found");
    expect((await failure(lessonApi.outline(made.id))).kind).toBe("not_found");

    // Revoking ends access on the next request with the same token, and My Courses empties.
    await signInAs(adminEmail);
    await staffEntitlementApi.revoke(made.id, granted.entitlement.id, "Chargeback upheld");
    expect((await withToken(studentLogin.accessToken, lockedPath)).status).toBe(404);
    expect((await staffEntitlementApi.list(made.id)).items).toEqual([]);
    await signInAs(studentEmail);
    expect((await myCoursesApi.list()).items).toEqual([]);
    expect((await failure(courseApi.get(made.id))).kind).toBe("not_found");

    // Access can be given again after a revoke.
    await signInAs(adminEmail);
    await staffCourseApi.publish(made.id);
    expect((await staffEntitlementApi.grant(made.id, student.id, "Reinstated")).created).toBe(true);
    await signInAs(studentEmail);
    expect((await lessonApi.get(made.id, locked.id)).body).toBe("OWNER ONLY TEXT");
  });

  it("refuses a person who cannot be given access", async () => {
    const adminEmail = await newAccount();
    makeAdmin(adminEmail);
    await signInAs(adminEmail);
    const made = await staffCourseApi.create({
      title: "Ineligible contract course",
      description: "d",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    });
    // An account that has not verified its email.
    const email = uniqueEmail();
    await authHttp.register({ email, password: GOOD_PASSWORD });
    const unverified = await instructorApi.lookup(email);
    expect(
      (await failure(staffEntitlementApi.grant(made.id, unverified.id, "Too early"))).kind,
    ).toBe("conflict");
    expect(
      (
        await failure(
          staffEntitlementApi.grant(
            made.id,
            "00000000-0000-4000-8000-000000000000",
            "No such person",
          ),
        )
      ).kind,
    ).toBe("not_found");
  });
});
