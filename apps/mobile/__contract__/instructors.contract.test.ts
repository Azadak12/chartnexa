import * as SecureStore from "expo-secure-store";
import { authHttp } from "../src/auth/auth-http";
import { authedFetch } from "../src/auth/authed-fetch";
import { sessionManager } from "../src/auth/session-manager";
import { AppError } from "../src/api/errors";
import {
  canCreateCourses,
  canManageCourses,
  canManageInstructors,
  canPublishCourse,
  fetchAccess,
  staffCourseApi,
} from "../src/courses/course-api";
import { instructorApi } from "../src/instructors/instructor-api";
import { sessionStore } from "../src/session/session-store";
import {
  GOOD_PASSWORD,
  loginAny,
  loginPair,
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

describe("Instructor permissions against the real API", () => {
  it("appoints, grants within the Manager ceiling, enforces, and revokes", async () => {
    const adminEmail = await newAccount();
    const managerEmail = await newAccount();
    const instructorEmail = await newAccount();
    makeAdmin(adminEmail);

    // Admin appoints a Manager and an Instructor.
    await signInAs(adminEmail);
    expect(canManageInstructors(await fetchAccess())).toBe(true);
    const manager = await instructorApi.lookup(managerEmail);
    await authedFetch(`/staff/users/${manager.id}/role`, {
      method: "PUT",
      body: { role: "manager", reason: "Runs operations" },
    });
    const person = await instructorApi.lookup(instructorEmail);
    expect(person.staffRole).toBeNull();
    await instructorApi.makeInstructor(person.id, "Teaches trading");
    expect((await instructorApi.lookup(instructorEmail)).staffRole).toBe("instructor");

    // A new Instructor can do nothing.
    await signInAs(instructorEmail);
    const none = await fetchAccess();
    expect(canManageCourses(none)).toBe(false);
    expect((await failure(staffCourseApi.list())).kind).toBe("forbidden");

    // The Manager grants create-course but cannot grant publishing.
    await signInAs(managerEmail);
    const before = await instructorApi.permissions(person.id);
    expect(before.grants).toEqual([]);
    expect(before.grantable.find((g) => g.permission === "course:publish")?.allowedForYou).toBe(
      false,
    );
    await instructorApi.grant(person.id, { permission: "course:create", reason: "Trusted author" });

    // The Instructor creates and edits a course, and cannot publish it.
    await signInAs(instructorEmail);
    const access = await fetchAccess();
    expect(canCreateCourses(access)).toBe(true);
    const title = `Instructor course ${Date.now()}`;
    const made = await staffCourseApi.create({
      title,
      description: "Written by an Instructor.",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    });
    const mine = await fetchAccess();
    expect(canManageCourses(mine)).toBe(true);
    expect(canPublishCourse(mine, made.id)).toBe(false);
    expect((await staffCourseApi.list()).items.map((c) => c.id)).toEqual([made.id]);
    const edited = await staffCourseApi.update(made.id, { expectedVersion: 1, priceCents: 1900 });
    expect(edited.priceCents).toBe(1900);
    expect((await failure(staffCourseApi.publish(made.id))).kind).toBe("forbidden");

    // The Manager is stopped at the ceiling.
    await signInAs(managerEmail);
    const refused = await failure(
      instructorApi.grant(person.id, {
        permission: "course:publish",
        courseId: made.id,
        reason: "Please",
      }),
    );
    expect(refused.kind).toBe("forbidden");

    // The Admin grants publishing; the Instructor publishes; the public sees it.
    await signInAs(adminEmail);
    const given = await instructorApi.grant(person.id, {
      permission: "course:publish",
      courseId: made.id,
      reason: "Trusted to publish",
    });
    expect(given.created).toBe(true);
    await signInAs(instructorEmail);
    expect(canPublishCourse(await fetchAccess(), made.id)).toBe(true);
    expect((await staffCourseApi.publish(made.id)).status).toBe("published");

    // Removing the edit grant stops the next edit.
    await signInAs(adminEmail);
    const grants = (await instructorApi.permissions(person.id)).grants;
    const edit = grants.find((g) => g.permission === "course:update" && g.courseId === made.id);
    expect(edit).toBeTruthy();
    await instructorApi.revokeGrant(person.id, edit!.id, "No longer needed");
    await signInAs(instructorEmail);
    const stopped = await failure(
      staffCourseApi.update(made.id, { expectedVersion: 3, priceCents: 2900 }),
    );
    expect(stopped.kind).toBe("forbidden");

    // Ending the role ends everything.
    await signInAs(adminEmail);
    await instructorApi.removeInstructorRole(person.id, "Left the team");
    expect((await failure(instructorApi.permissions(person.id))).kind).toBe("not_found");
  });
});
