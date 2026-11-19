import * as SecureStore from "expo-secure-store";
import { AppError } from "../src/api/errors";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { courseApi, staffCourseApi } from "../src/courses/course-api";
import { newPurchaseKey, paymentApi } from "../src/payments/payment-api";
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

describe("Test-mode purchases against the real API", () => {
  it("a student buys a course once; a failed attempt gives nothing; owning it blocks a second purchase", async () => {
    const adminEmail = await newAccount();
    const buyerEmail = await newAccount();
    makeAdmin(adminEmail);
    await signInAs(adminEmail);
    const course = await staffCourseApi.create({
      title: "Paid contract course",
      description: "A complete description.",
      level: "beginner",
      priceCents: 2500,
      coverTone: "blue",
    });
    await staffCourseApi.publish(course.id);

    await signInAs(buyerEmail);
    const key = newPurchaseKey();
    const first = await paymentApi.createOrder(course.id, key);
    expect(first).toMatchObject({ status: "pending", amountCents: 2500, testMode: true });
    expect((await paymentApi.createOrder(course.id, key)).id).toBe(first.id);
    const failed = await paymentApi.completeTestCheckout(first.checkoutRef, "failed");
    expect(failed.status).toBe("failed");
    expect((await courseApi.get(course.id)).enrolled).toBe(false);

    const second = await paymentApi.createOrder(course.id, newPurchaseKey());
    expect(second.id).not.toBe(first.id);
    const paid = await paymentApi.completeTestCheckout(second.checkoutRef, "paid");
    expect(paid.status).toBe("paid");
    expect((await courseApi.get(course.id)).enrolled).toBe(true);
    const again = await failure(paymentApi.createOrder(course.id, newPurchaseKey()));
    expect([again.kind, again.code]).toEqual(["conflict", "ALREADY_OWNED"]);
    const history = await paymentApi.listOrders();
    expect(history.items.map((o) => o.status)).toEqual(["paid", "failed"]);
  }, 120_000);
});
