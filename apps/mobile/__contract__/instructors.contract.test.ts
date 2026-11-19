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
import { permissionApi } from "../src/permissions/permission-api";
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

describe("Instructor permissions against the real API", () => {
  it("appoints, grants (Admin only), enforces, manages from the permission screens, and revokes", async () => {
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

    // A Manager cannot see or change anyone's permissions (decision Q38).
    await signInAs(managerEmail);
    expect(canManageInstructors(await fetchAccess())).toBe(false);
    expect((await failure(instructorApi.permissions(person.id))).kind).toBe("forbidden");
    expect(
      (
        await failure(
          instructorApi.grant(person.id, { permission: "course:create", reason: "Trusted author" }),
        )
      ).kind,
    ).toBe("forbidden");
    expect((await failure(permissionApi.users("instructor", "", null))).kind).toBe("forbidden");

    // The Admin gives create-course through the Permission Management screen's API, with an end
    // date, and sees it listed as an individual grant.
    await signInAs(adminEmail);
    const page = await permissionApi.users("instructor", "", null);
    expect(page.items.some((u) => u.id === person.id)).toBe(true);
    const d0 = await permissionApi.detail(person.id);
    const end = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const d1 = await permissionApi.save(person.id, {
      reason: "Trusted author",
      expectedVersion: d0.version,
      changes: [{ permission: "course:create", enabled: true, expiresAt: end }],
    });
    expect(d1.permissions.find((p) => p.permission === "course:create")).toMatchObject({
      enabled: true,
      source: "individual",
    });
    expect(
      (
        await failure(
          permissionApi.save(person.id, {
            reason: "Stale screen",
            expectedVersion: d0.version,
            changes: [{ permission: "course:create", enabled: false }],
          }),
        )
      ).kind,
    ).toBe("conflict");

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
