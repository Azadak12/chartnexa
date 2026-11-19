import * as SecureStore from "expo-secure-store";
import { AppError } from "../src/api/errors";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { staffCourseApi } from "../src/courses/course-api";
import { newPurchaseKey, paymentApi } from "../src/payments/payment-api";
import { opsApi } from "../src/ops/ops-api";
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
describe("Operations screens against the real API", () => {
  it("an Admin reads filtered audit records and order statuses; a student is refused both", async () => {
    const adminEmail = await newAccount();
    const buyerEmail = await newAccount();
    makeAdmin(adminEmail);
    await signInAs(adminEmail);
    const course = await staffCourseApi.create({
      title: "Ops contract course",
      description: "A complete description.",
      level: "beginner",
      priceCents: 1500,
      coverTone: "blue",
    });
    await staffCourseApi.publish(course.id);

    await signInAs(buyerEmail);
    const order = await paymentApi.createOrder(course.id, newPurchaseKey());
    await paymentApi.completeTestCheckout(order.checkoutRef, "paid");
    expect((await failure(opsApi.audit({}))).kind).toBe("forbidden");
    expect((await failure(opsApi.orders({}))).kind).toBe("forbidden");

    await signInAs(adminEmail);
    const published = await opsApi.audit({ action: "course.publish" });
    expect(published.items.some((e) => e.targetId === course.id)).toBe(true);
    expect(published.items.every((e) => e.action === "course.publish")).toBe(true);
    const denied = await opsApi.audit({ outcome: "denied" });
    expect(denied.items.every((e) => e.outcome === "denied")).toBe(true);
    const paid = await opsApi.orders({ status: "paid" });
    expect(paid.items.find((o) => o.id === order.id)).toMatchObject({
      status: "paid",
      testMode: true,
    });
    expect(paid.items.every((o) => o.status === "paid")).toBe(true);
  }, 120_000);
});
