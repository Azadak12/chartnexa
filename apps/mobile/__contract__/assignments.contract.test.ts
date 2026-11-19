import * as SecureStore from "expo-secure-store";
import { AppError } from "../src/api/errors";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { staffCourseApi } from "../src/courses/course-api";
import { assignmentApi, staffAssignmentApi } from "../src/assignments/assignment-api";
import { staffEntitlementApi } from "../src/entitlements/entitlement-api";
import { instructorApi } from "../src/instructors/instructor-api";
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
describe("Assignments against the real API", () => {
  it("an instructor-level author assigns coursework; the student hands in; feedback locks it", async () => {
    const adminEmail = await newAccount();
    const studentEmail = await newAccount();
    const strangerEmail = await newAccount();
    makeAdmin(adminEmail);
    await signInAs(adminEmail);
    const course = await staffCourseApi.create({
      title: "Assignment contract course",
      description: "A complete description.",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    });
    await staffCourseApi.publish(course.id);
    const student = await instructorApi.lookup(studentEmail);
    const stranger = await instructorApi.lookup(strangerEmail);
    await staffEntitlementApi.grant(course.id, student.id, "Paid by invoice");

    const draft = await staffAssignmentApi.create(course.id, {
      title: "Identify chart patterns",
      instructions: "Describe the patterns you see.",
    });
    expect(draft).toMatchObject({ status: "draft", assignedCount: 0 });
    const early = await failure(staffAssignmentApi.assign(course.id, draft.id, { all: true }));
    expect([early.kind, early.code]).toEqual(["conflict", "ASSIGNMENT_NOT_PUBLISHED"]);
    const published = await staffAssignmentApi.update(course.id, draft.id, {
      expectedVersion: draft.version,
      status: "published",
    });
    const outside = await failure(
      staffAssignmentApi.assign(course.id, published.id, { userIds: [stranger.id] }),
    );
    expect(outside.kind).toBe("validation");
    expect(await staffAssignmentApi.assign(course.id, published.id, { all: true })).toEqual({
      assigned: 1,
      alreadyAssigned: 0,
    });

    await signInAs(studentEmail);
    const list = await assignmentApi.list();
    expect(list.map((a) => [a.title, a.state])).toEqual([["Identify chart patterns", "to_do"]]);
    expect((await assignmentApi.get(published.id)).instructions).toBe(
      "Describe the patterns you see.",
    );
    const handed = await assignmentApi.submit(published.id, "I see a double top.");
    expect(handed).toMatchObject({ status: "submitted", late: false });
    await assignmentApi.submit(published.id, "I see a double top and a breakout.");

    await signInAs(strangerEmail);
    expect((await failure(assignmentApi.get(published.id))).kind).toBe("not_found");
    expect((await failure(staffAssignmentApi.list(course.id))).kind).toBe("forbidden");

    await signInAs(adminEmail);
    const people = await staffAssignmentApi.recipients(course.id, published.id);
    expect(people).toHaveLength(1);
    expect(people[0]?.state).toBe("submitted");
    const sub = await staffAssignmentApi.submission(course.id, published.id, student.id);
    expect(sub.body).toBe("I see a double top and a breakout.");
    await staffAssignmentApi.feedback(course.id, published.id, student.id, "Good eye.");

    await signInAs(studentEmail);
    const after = await assignmentApi.get(published.id);
    expect(after).toMatchObject({ state: "reviewed", submission: { feedback: "Good eye." } });
    const locked = await failure(assignmentApi.submit(published.id, "One more change."));
    expect([locked.kind, locked.code]).toEqual(["conflict", "SUBMISSION_LOCKED"]);
  }, 120_000);
});
