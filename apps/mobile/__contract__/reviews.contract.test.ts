import * as SecureStore from "expo-secure-store";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { AppError } from "../src/api/errors";
import { courseApi, staffCourseApi } from "../src/courses/course-api";
import { staffEntitlementApi } from "../src/entitlements/entitlement-api";
import { instructorApi } from "../src/instructors/instructor-api";
import { reviewsApi } from "../src/reviews/review-api";
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

describe("Reviews against the real API", () => {
  it("owners write, edit and delete; the summary is exact; others and revoked owners are refused", async () => {
    const adminEmail = await newAccount();
    const ownerEmail = await newAccount();
    const secondEmail = await newAccount();
    const strangerEmail = await newAccount();
    makeAdmin(adminEmail);

    await signInAs(adminEmail);
    const made = await staffCourseApi.create({
      title: "Reviews contract course",
      description: "A complete description.",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    });
    await staffCourseApi.publish(made.id);
    const owner = await instructorApi.lookup(ownerEmail);
    const second = await instructorApi.lookup(secondEmail);
    const g1 = await staffEntitlementApi.grant(made.id, owner.id, "Paid by invoice");
    await staffEntitlementApi.grant(made.id, second.id, "Paid by invoice");
    expect((await courseApi.get(made.id)).rating).toEqual({ count: 0, average: null });

    // A stranger may read but not write, and learns nothing else.
    await signInAs(strangerEmail);
    expect((await reviewsApi.list(made.id)).items).toEqual([]);
    expect((await failure(reviewsApi.write(made.id, { rating: 5, body: "Nope" }))).kind).toBe(
      "forbidden",
    );
    expect((await failure(reviewsApi.mine(made.id))).kind).toBe("forbidden");
    expect((await failure(reviewsApi.remove(made.id))).kind).toBe("forbidden");

    // The owner writes, and an identical second write changes nothing.
    await signInAs(ownerEmail);
    expect((await reviewsApi.mine(made.id)).review).toBeNull();
    const first = await reviewsApi.write(made.id, { rating: 5, body: "Clear and useful." });
    expect(first).toMatchObject({ rating: 5, mine: true, reviewerName: "Student" });
    expect(await reviewsApi.write(made.id, { rating: 5, body: "Clear and useful." })).toEqual(
      first,
    );
    expect((await failure(reviewsApi.write(made.id, { rating: 0, body: "" }))).kind).toBe(
      "validation",
    );
    expect((await courseApi.get(made.id)).rating).toEqual({ count: 1, average: 5 });

    // A second owner, and the exact average on the page and on the catalog card.
    await signInAs(secondEmail);
    await reviewsApi.write(made.id, { rating: 2, body: "Too fast for me." });
    const card = (await courseApi.list({})).items.find((c) => c.id === made.id);
    expect(card?.rating).toEqual({ count: 2, average: 3.5 });
    const list = await reviewsApi.list(made.id);
    expect(list.items.map((r) => r.body)).toEqual(["Too fast for me.", "Clear and useful."]);
    expect(list.items.map((r) => r.mine)).toEqual([true, false]);
    expect(JSON.stringify(list)).not.toContain(ownerEmail.toLowerCase());

    // Edit, then delete (twice), and the summary follows.
    await signInAs(ownerEmail);
    await reviewsApi.write(made.id, { rating: 3, body: "Edited." });
    expect((await courseApi.get(made.id)).rating).toEqual({ count: 2, average: 2.5 });
    expect(await reviewsApi.remove(made.id)).toEqual({ deleted: true });
    expect(await reviewsApi.remove(made.id)).toEqual({ deleted: false });
    expect((await courseApi.get(made.id)).rating).toEqual({ count: 1, average: 2 });

    // Revoking access stops writes on the next request but keeps the existing review.
    await signInAs(adminEmail);
    await staffEntitlementApi.revoke(made.id, g1.entitlement.id, "Chargeback upheld");
    const second2 = (await staffEntitlementApi.list(made.id)).items[0]!;
    await staffEntitlementApi.revoke(made.id, second2.id, "Chargeback upheld");
    await signInAs(secondEmail);
    expect((await failure(reviewsApi.write(made.id, { rating: 1, body: "Angry" }))).kind).toBe(
      "forbidden",
    );
    expect((await reviewsApi.list(made.id)).items.map((r) => r.body)).toEqual(["Too fast for me."]);
    expect((await courseApi.get(made.id)).rating).toEqual({ count: 1, average: 2 });
  });

  it("keeps the summary exact when several owners write at the same moment", async () => {
    const adminEmail = await newAccount();
    makeAdmin(adminEmail);
    await signInAs(adminEmail);
    const made = await staffCourseApi.create({
      title: "Concurrent reviews course",
      description: "d",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    });
    await staffCourseApi.publish(made.id);
    const emails = await Promise.all([newAccount(), newAccount(), newAccount(), newAccount()]);
    for (const e of emails) {
      const u = await instructorApi.lookup(e);
      await staffEntitlementApi.grant(made.id, u.id, "Paid by invoice");
    }
    const ratings = [5, 4, 2, 1];
    const tokens = await Promise.all(
      emails.map((e) => loginPair({ email: e, password: GOOD_PASSWORD })),
    );
    await Promise.all(
      tokens.map((t, i) =>
        realFetch(`${process.env.CONTRACT_API_URL}/me/courses/${made.id}/review`, {
          method: "PUT",
          headers: {
            authorization: `Bearer ${t.accessToken}`,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ rating: ratings[i], body: `Concurrent ${i}` }),
        }),
      ),
    );
    expect((await courseApi.get(made.id)).rating).toEqual({ count: 4, average: 3 });
    expect((await reviewsApi.list(made.id)).items).toHaveLength(4);
  });
});
