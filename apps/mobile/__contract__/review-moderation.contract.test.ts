import * as SecureStore from "expo-secure-store";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { AppError } from "../src/api/errors";
import { courseApi, staffCourseApi } from "../src/courses/course-api";
import { staffEntitlementApi } from "../src/entitlements/entitlement-api";
import { instructorApi } from "../src/instructors/instructor-api";
import { moderationApi } from "../src/reviews/moderation-api";
import { reviewsApi } from "../src/reviews/review-api";
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

describe("Review moderation against the real API", () => {
  it("reports, hides, appeals and restores, with exact totals and the right refusals", async () => {
    const adminA = await newAccount();
    const adminB = await newAccount();
    const ownerEmail = await newAccount();
    const otherEmail = await newAccount();
    const strangerEmail = await newAccount();
    makeAdmin(adminA);
    makeAdmin(adminB);

    await signInAs(adminA);
    const made = await staffCourseApi.create({
      title: "Moderation contract course",
      description: "A complete description.",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    });
    await staffCourseApi.publish(made.id);
    const owner = await instructorApi.lookup(ownerEmail);
    const other = await instructorApi.lookup(otherEmail);
    await staffEntitlementApi.grant(made.id, owner.id, "Paid by invoice");
    await staffEntitlementApi.grant(made.id, other.id, "Paid by invoice");

    await signInAs(ownerEmail);
    const bad = await reviewsApi.write(made.id, { rating: 1, body: "Honest but harsh" });
    await signInAs(otherEmail);
    await reviewsApi.write(made.id, { rating: 5, body: "Great" });
    expect((await courseApi.get(made.id)).rating).toEqual({ count: 2, average: 3 });

    // A signed-in stranger reports it, twice; nothing changes for anyone.
    await signInAs(strangerEmail);
    await reviewsApi.report(made.id, bad.id, { reason: "off_topic", note: "x" });
    await reviewsApi.report(made.id, bad.id, { reason: "spam" });
    expect((await reviewsApi.list(made.id)).items).toHaveLength(2);
    // Students cannot see or use the moderators' tools.
    expect((await failure(moderationApi.queue("reported"))).kind).toBe("forbidden");
    expect((await failure(moderationApi.hide(bad.id, { reason: "spam", note: "" }))).kind).toBe(
      "forbidden",
    );

    // The author cannot report their own review.
    await signInAs(ownerEmail);
    expect((await failure(reviewsApi.report(made.id, bad.id, { reason: "spam" }))).kind).toBe(
      "forbidden",
    );

    // A moderator sees it in the queue, with one open report, and hides it.
    await signInAs(adminA);
    const reported = await moderationApi.queue("reported");
    const item = reported.items.find((r) => r.id === bad.id);
    expect(item).toMatchObject({ openReportCount: 1, hidden: false });
    const detail = await moderationApi.detail(bad.id);
    expect(detail.reports).toHaveLength(1);
    expect(JSON.stringify(detail)).not.toContain("@");
    const hid = await moderationApi.hide(bad.id, {
      reason: "off_topic",
      note: "Not about the course",
    });
    expect(hid.changed).toBe(true);
    expect((await moderationApi.hide(bad.id, { reason: "spam", note: "" })).changed).toBe(false);
    expect((await courseApi.get(made.id)).rating).toEqual({ count: 1, average: 5 });
    expect((await reviewsApi.list(made.id)).items.map((r) => r.id)).not.toContain(bad.id);

    // The author sees why, edits it (it stays hidden) and appeals once, even sent many times.
    await signInAs(ownerEmail);
    const mine = await reviewsApi.mine(made.id);
    expect(mine.moderation).toMatchObject({
      state: "hidden",
      reason: "off_topic",
      note: "Not about the course",
      canAppeal: true,
    });
    await reviewsApi.write(made.id, { rating: 2, body: "Reworded politely" });
    expect((await courseApi.get(made.id)).rating).toEqual({ count: 1, average: 5 });
    const sent = await Promise.allSettled(
      Array.from({ length: 5 }, () => reviewsApi.appeal(made.id, "This is on topic.")),
    );
    expect(sent.filter((s) => s.status === "fulfilled")).toHaveLength(1);
    expect((await reviewsApi.mine(made.id)).moderation?.appeal?.status).toBe("open");

    // A moderator decides: overturned, so the review is back and counted.
    await signInAs(adminB);
    const appeals = await moderationApi.queue("appeals");
    expect(appeals.items.map((r) => r.id)).toContain(bad.id);
    const open = (await moderationApi.detail(bad.id)).appeals.find((a) => a.status === "open")!;
    const decided = await moderationApi.decide(open.id, { decision: "overturn", note: "Agreed" });
    expect(decided.review.hidden).toBe(false);
    expect(
      (await failure(moderationApi.decide(open.id, { decision: "uphold", note: "" }))).kind,
    ).toBe("conflict");
    expect((await courseApi.get(made.id)).rating).toEqual({ count: 2, average: 3.5 });
    expect((await reviewsApi.list(made.id)).items.map((r) => r.id)).toContain(bad.id);

    // Hiding and restoring again leaves the totals where they were.
    await moderationApi.hide(bad.id, { reason: "abusive", note: "" });
    await moderationApi.restore(bad.id, {});
    await moderationApi.restore(bad.id, {});
    expect((await courseApi.get(made.id)).rating).toEqual({ count: 2, average: 3.5 });

    // Staff cannot change the text: the only write route is the author's own.
    await signInAs(adminA);
    expect((await failure(reviewsApi.write(made.id, { rating: 5, body: "Rewritten" }))).kind).toBe(
      "forbidden",
    );
    expect((await reviewsApi.list(made.id)).items.find((r) => r.id === bad.id)?.body).toBe(
      "Reworded politely",
    );
  });
});
