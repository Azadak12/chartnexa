import * as SecureStore from "expo-secure-store";
import { AppError } from "../src/api/errors";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { staffCourseApi } from "../src/courses/course-api";
import { staffEntitlementApi } from "../src/entitlements/entitlement-api";
import { instructorApi } from "../src/instructors/instructor-api";
import { liveApi, staffLiveApi } from "../src/live/live-api";
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
const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

describe("Live classes against the real API", () => {
  it("staff schedule and cancel; owners see the schedule and get the link only once it opens", async () => {
    const adminEmail = await newAccount();
    const studentEmail = await newAccount();
    const strangerEmail = await newAccount();
    makeAdmin(adminEmail);
    await signInAs(adminEmail);
    const course = await staffCourseApi.create({
      title: "Live contract course",
      description: "A complete description.",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    });
    await staffCourseApi.publish(course.id);
    const soon = await staffLiveApi.create(course.id, {
      title: "Starting soon",
      startsAt: at(5),
      durationMinutes: 30,
      joinUrl: "https://meet.example.com/soon",
    });
    expect(soon).toMatchObject({ state: "open", version: 1, provider: "manual" });
    const later = await staffLiveApi.create(course.id, {
      title: "Later today",
      startsAt: at(180),
      durationMinutes: 45,
      joinUrl: "https://meet.example.com/later",
    });
    const bad = await failure(
      staffLiveApi.create(course.id, {
        title: "In the past",
        startsAt: at(-5),
        durationMinutes: 30,
        joinUrl: "https://meet.example.com/x",
      }),
    );
    expect(bad.kind).toBe("validation");
    expect(bad.fields.map((f) => f.field)).toContain("startsAt");
    const moved = await staffLiveApi.update(course.id, later.id, {
      expectedVersion: 1,
      startsAt: at(240),
    });
    expect(moved.version).toBe(2);
    const stale = await failure(
      staffLiveApi.update(course.id, later.id, { expectedVersion: 1, title: "Stale edit" }),
    );
    expect(stale.kind).toBe("conflict");
    const student = await instructorApi.lookup(studentEmail);
    await staffEntitlementApi.grant(course.id, student.id, "Paid by invoice");

    await signInAs(studentEmail);
    const list = await liveApi.forCourse(course.id);
    expect(list.map((s) => [s.title, s.state])).toEqual([
      ["Starting soon", "open"],
      ["Later today", "upcoming"],
    ]);
    expect(JSON.stringify(list)).not.toContain("meet.example.com");
    expect((await liveApi.join(course.id, soon.id)).url).toBe("https://meet.example.com/soon");
    const early = await failure(liveApi.join(course.id, later.id));
    expect([early.kind, early.code]).toEqual(["conflict", "LIVE_NOT_OPEN"]);
    expect((await liveApi.mine()).map((s) => s.courseTitle)).toEqual([
      "Live contract course",
      "Live contract course",
    ]);

    await signInAs(adminEmail);
    const cancelled = await staffLiveApi.cancel(course.id, later.id, 2, "Instructor ill");
    expect(cancelled.state).toBe("cancelled");
    expect((await staffLiveApi.list(course.id)).find((s) => s.id === soon.id)?.joinedCount).toBe(1);

    await signInAs(studentEmail);
    const after = await liveApi.forCourse(course.id);
    expect(after.find((s) => s.id === later.id)).toMatchObject({
      state: "cancelled",
      cancelReason: "Instructor ill",
    });
    const refused = await failure(liveApi.join(course.id, later.id));
    expect(refused.code).toBe("LIVE_CANCELLED");

    await signInAs(strangerEmail);
    expect((await failure(liveApi.forCourse(course.id))).kind).toBe("forbidden");
    expect((await failure(staffLiveApi.list(course.id))).kind).toBe("forbidden");
  }, 120_000);
});
