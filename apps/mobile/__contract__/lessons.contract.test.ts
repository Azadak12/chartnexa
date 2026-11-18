import * as SecureStore from "expo-secure-store";
import { authHttp } from "../src/auth/auth-http";
import { authedFetch } from "../src/auth/authed-fetch";
import { sessionManager } from "../src/auth/session-manager";
import { AppError } from "../src/api/errors";
import {
  canAuthorLessons,
  courseApi,
  fetchAccess,
  staffCourseApi,
} from "../src/courses/course-api";
import { instructorApi } from "../src/instructors/instructor-api";
import { lessonApi, staffLessonApi } from "../src/lessons/lesson-api";
import { splitLessonText } from "../src/lessons/steps";
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
const course = {
  title: "Lessons contract course",
  description: "A complete description.",
  level: "beginner",
  priceCents: 0,
  coverTone: "blue",
} as const;

describe("Lessons against the real API", () => {
  it("staff author, order and publish; the public sees outline and previews only", async () => {
    const adminEmail = await newAccount();
    makeAdmin(adminEmail);
    await signInAs(adminEmail);
    const made = await staffCourseApi.create(course);
    expect(canAuthorLessons(await fetchAccess(), made.id)).toBe(true);

    const intro = await staffLessonApi.create(made.id, {
      title: "Intro",
      body: "Free intro text",
      isPreview: true,
      idempotencyKey: key(),
    });
    const k = key();
    const paid = await staffLessonApi.create(made.id, {
      title: "Paid lesson",
      body: "SECRET paid text",
      isPreview: false,
      idempotencyKey: k,
    });
    // A retry with the same key returns the same lesson instead of adding another.
    const again = await staffLessonApi.create(made.id, {
      title: "Paid lesson",
      body: "SECRET paid text",
      isPreview: false,
      idempotencyKey: k,
    });
    expect(again.id).toBe(paid.id);
    const third = await staffLessonApi.create(made.id, {
      title: "Third",
      isPreview: false,
      idempotencyKey: key(),
    });
    expect([intro.position, paid.position, third.position]).toEqual([1, 2, 3]);

    const edited = await staffLessonApi.update(made.id, paid.id, {
      expectedVersion: 1,
      title: "Paid lesson (edited)",
    });
    expect(edited.version).toBe(2);
    expect(
      (await failure(staffLessonApi.update(made.id, paid.id, { expectedVersion: 1, title: "x" })))
        .kind,
    ).toBe("conflict");

    const reordered = await staffLessonApi.reorder(made.id, [third.id, intro.id, paid.id]);
    expect(reordered.items.map((l) => l.id)).toEqual([third.id, intro.id, paid.id]);
    expect((await failure(staffLessonApi.reorder(made.id, [intro.id]))).code).toBe(
      "LESSON_ORDER_CHANGED",
    );

    // Draft courses are invisible to the public.
    expect((await failure(lessonApi.outline(made.id))).kind).toBe("not_found");
    // Paragraphs survive the round trip through the real API, so the reader can split them into steps.
    const written = "First idea.\r\n\r\nSecond idea.\n \n\n<b>Third</b> idea.\n";
    await staffLessonApi.update(made.id, intro.id, { expectedVersion: 1, body: written });
    await staffCourseApi.publish(made.id);
    expect(splitLessonText((await lessonApi.get(made.id, intro.id)).body)).toEqual([
      "First idea.",
      "Second idea.",
      "<b>Third</b> idea.",
    ]);
    await staffLessonApi.update(made.id, intro.id, { expectedVersion: 2, body: "Free intro text" });

    const outline = await lessonApi.outline(made.id);
    expect(outline.items.map((l) => [l.title, l.position, l.isPreview])).toEqual([
      ["Third", 1, false],
      ["Intro", 2, true],
      ["Paid lesson (edited)", 3, false],
    ]);
    expect(JSON.stringify(outline)).not.toContain("SECRET");
    expect((await lessonApi.get(made.id, intro.id)).body).toBe("Free intro text");
    const locked = await failure(lessonApi.get(made.id, paid.id));
    expect(locked.kind).toBe("forbidden");
    expect(locked.code).toBe("ENROLLMENT_REQUIRED");
    const detail = await courseApi.get(made.id);
    expect(detail).toMatchObject({ lessonCount: 3, previewCount: 1 });

    await staffLessonApi.remove(made.id, third.id);
    expect((await staffLessonApi.list(made.id)).items.map((l) => l.position)).toEqual([1, 2]);

    await staffCourseApi.unpublish(made.id);
    expect((await failure(lessonApi.get(made.id, intro.id))).kind).toBe("not_found");
  });

  it("an Instructor edits lessons only on a course they have the lesson grant for", async () => {
    const adminEmail = await newAccount();
    const ownerEmail = await newAccount();
    const otherEmail = await newAccount();
    makeAdmin(adminEmail);

    await signInAs(adminEmail);
    const owner = await instructorApi.lookup(ownerEmail);
    const other = await instructorApi.lookup(otherEmail);
    await instructorApi.makeInstructor(owner.id, "Teaches trading");
    await instructorApi.makeInstructor(other.id, "Teaches charts");
    await instructorApi.grant(owner.id, { permission: "course:create", reason: "Trusted author" });

    // Creating a course automatically gives its author the lesson grant.
    await signInAs(ownerEmail);
    const mine = await staffCourseApi.create(course);
    expect(canAuthorLessons(await fetchAccess(), mine.id)).toBe(true);
    const lesson = await staffLessonApi.create(mine.id, {
      title: "By the Instructor",
      isPreview: false,
      idempotencyKey: key(),
    });
    expect((await staffLessonApi.list(mine.id)).items).toHaveLength(1);

    // Another Instructor with no grants gets the same refusal for this course as for a missing one.
    await signInAs(otherEmail);
    expect(canAuthorLessons(await fetchAccess(), mine.id)).toBe(false);
    expect((await failure(staffLessonApi.list(mine.id))).kind).toBe("forbidden");
    expect(
      (await failure(staffLessonApi.update(mine.id, lesson.id, { expectedVersion: 1, title: "x" })))
        .kind,
    ).toBe("forbidden");
    expect((await failure(staffLessonApi.remove(mine.id, lesson.id))).kind).toBe("forbidden");

    // Removing the lesson grant stops the owner on the very next request.
    await signInAs(adminEmail);
    const grants = (await instructorApi.permissions(owner.id)).grants;
    const g = grants.find((x) => x.permission === "lesson:upload" && x.courseId === mine.id);
    expect(g).toBeTruthy();
    await instructorApi.revokeGrant(owner.id, g!.id, "No longer needed");
    await signInAs(ownerEmail);
    expect(
      (
        await failure(
          staffLessonApi.create(mine.id, {
            title: "After revoke",
            isPreview: false,
            idempotencyKey: key(),
          }),
        )
      ).kind,
    ).toBe("forbidden");
    // Unsigned callers cannot reach staff routes at all.
    sessionStore.set("signed-out");
    sessionManager._resetForTests();
    secure.__reset();
    expect((await failure(authedFetch(`/staff/courses/${mine.id}/lessons`))).kind).toBe(
      "unauthorized",
    );
  });
});
