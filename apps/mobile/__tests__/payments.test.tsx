import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import * as SecureStore from "expo-secure-store";
import { courseApi } from "../src/courses/course-api";
import { paymentApi } from "../src/payments/payment-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
}));
jest.mock("../src/lessons/lesson-api", () => ({
  lessonApi: { outline: jest.fn(async () => ({ items: [], modules: [] })), get: jest.fn() },
  staffLessonApi: {},
}));
jest.mock("../src/reviews/review-api", () => ({
  reviewsApi: {
    list: jest.fn(async () => ({ items: [], nextCursor: null })),
    mine: jest.fn(async () => ({ review: null, moderation: null })),
  },
}));
jest.mock("../src/payments/payment-api", () => ({
  ...jest.requireActual("../src/payments/payment-api"),
  paymentApi: {
    createOrder: jest.fn(),
    getOrder: jest.fn(),
    listOrders: jest.fn(),
    completeTestCheckout: jest.fn(),
  },
}));
jest.mock("../src/auth/account-api", () => ({
  accountApi: {
    me: jest.fn().mockResolvedValue({
      id: "u1",
      email: "a@b.co",
      displayName: "Ann",
      emailVerified: true,
      createdAt: "2026-11-17T00:00:00.000Z",
    }),
    resendVerification: jest.fn(),
  },
}));

const pay = paymentApi as unknown as Record<
  "createOrder" | "getOrder" | "listOrders" | "completeTestCheckout",
  jest.Mock
>;
const courses = courseApi as unknown as { get: jest.Mock };
const secure = SecureStore as unknown as { __reset: () => void };
const app = "./app";
const course = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  title: "Price Action",
  description: "d",
  level: "beginner",
  priceCents: 4900,
  currency: "USD",
  coverTone: "blue",
  publishedAt: "2026-11-17T00:00:00.000Z",
  lessonCount: 0,
  previewCount: 0,
  enrolled: false,
  ...over,
});
const order = (over: Record<string, unknown> = {}) => ({
  id: "o1",
  courseId: "c1",
  courseTitle: "Price Action",
  amountCents: 4900,
  currency: "USD",
  status: "pending",
  provider: "test",
  testMode: true,
  checkoutRef: "test_cs_1",
  createdAt: "2026-11-19T10:00:00.000Z",
  paidAt: null,
  ...over,
});
const page = (items: unknown[]) => ({ items, nextCursor: null });

let announce: jest.SpyInstance;
beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  courses.get.mockResolvedValue(course());
  pay.listOrders.mockResolvedValue(page([]));
  pay.getOrder.mockResolvedValue(order());
});

describe("buying a course in test mode", () => {
  it("starts a checkout once, with one key kept across retries, and opens the checkout", async () => {
    let release!: (o: unknown) => void;
    pay.createOrder
      .mockRejectedValueOnce(appError("network"))
      .mockImplementation(() => new Promise((r) => (release = r)));
    await renderRouter(app, { initialUrl: "/course/c1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Buy for $49.00" }));
    expect(await screen.findByTestId("buy-error")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Buy for $49.00" }));
    await fireEvent.press(screen.getByRole("button", { name: "Buy for $49.00" }));
    expect(pay.createOrder).toHaveBeenCalledTimes(2);
    expect(pay.createOrder.mock.calls[0][1]).toBe(pay.createOrder.mock.calls[1][1]);
    await act(async () => release(order()));
    expect(
      await screen.findByText("Test checkout. No real payment is made and no card is needed.", {
        exact: false,
      }),
    ).toBeTruthy();
    expect(screen).toHavePathname("/checkout/o1");
  });

  it("offers to finish an unfinished checkout instead of starting a new one", async () => {
    pay.listOrders.mockResolvedValue(page([order()]));
    await renderRouter(app, { initialUrl: "/course/c1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Finish your purchase" }));
    expect(screen).toHavePathname("/checkout/o1");
    expect(pay.createOrder).not.toHaveBeenCalled();
  });

  it("says a free course is free, and shows no buy button for owners", async () => {
    courses.get.mockResolvedValue(course({ priceCents: 0 }));
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByText(/This course is free/)).toBeTruthy();
    await screen.unmount();
    courses.get.mockResolvedValue(course({ enrolled: true, progress: { completed: 0, total: 0 } }));
    await renderRouter(app, { initialUrl: "/course/c1" });
    await screen.findByTestId("enrolled-notice");
    expect(screen.queryByRole("button", { name: /Buy for/ })).toBeNull();
  });
});

describe("the test checkout", () => {
  it("pays once, announces it and leads to the course", async () => {
    let release!: (o: unknown) => void;
    pay.completeTestCheckout.mockImplementation(() => new Promise((r) => (release = r)));
    await renderRouter(app, { initialUrl: "/checkout/o1" });
    expect(await screen.findByText("Status: Not finished")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Pay $49.00 (test)" }));
    await fireEvent.press(screen.getByRole("button", { name: "Pay $49.00 (test)" }));
    expect(pay.completeTestCheckout).toHaveBeenCalledTimes(1);
    expect(pay.completeTestCheckout).toHaveBeenCalledWith("test_cs_1", "paid");
    await act(async () => release(order({ status: "paid", paidAt: "x" })));
    expect(await screen.findByTestId("paid-notice")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Payment complete. You now have this course.");
    await fireEvent.press(screen.getByRole("button", { name: "Go to the course" }));
    expect(screen).toHavePathname("/course/c1");
  });

  it("after a failed payment, Try again starts a fresh checkout", async () => {
    pay.completeTestCheckout.mockResolvedValue(order({ status: "failed" }));
    pay.createOrder.mockResolvedValue(order({ id: "o2", checkoutRef: "test_cs_2" }));
    await renderRouter(app, { initialUrl: "/checkout/o1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Simulate a failed payment" }));
    expect(await screen.findByText("Status: Payment failed")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Payment failed");
    pay.getOrder.mockResolvedValue(order({ id: "o2", checkoutRef: "test_cs_2" }));
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen).toHavePathname("/checkout/o2"));
  });

  it("shows where an earlier checkout ended when the app is reopened", async () => {
    pay.getOrder.mockResolvedValue(order({ status: "paid", paidAt: "x" }));
    await renderRouter(app, { initialUrl: "/checkout/o1" });
    expect(await screen.findByTestId("paid-notice")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pay/ })).toBeNull();
  });

  it("explains a missing order and a failed request", async () => {
    pay.getOrder.mockRejectedValue(appError("not_found"));
    await renderRouter(app, { initialUrl: "/checkout/o9" });
    expect(await screen.findByText("This purchase was not found.")).toBeTruthy();
    await screen.unmount();
    pay.getOrder.mockResolvedValue(order());
    pay.completeTestCheckout.mockRejectedValue(appError("server"));
    await renderRouter(app, { initialUrl: "/checkout/o1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Cancel purchase" }));
    expect(await screen.findByTestId("checkout-error")).toBeTruthy();
  });
});

describe("purchase history", () => {
  it("lists purchases with the status in words", async () => {
    pay.listOrders.mockResolvedValue(
      page([order({ status: "paid" }), order({ id: "o2", status: "reversed" })]),
    );
    await renderRouter(app, { initialUrl: "/profile/purchases" });
    expect(await screen.findByText("$49.00 · Paid")).toBeTruthy();
    expect(screen.getByText("$49.00 · Payment reversed, access removed")).toBeTruthy();
  });

  it("has an empty state", async () => {
    await renderRouter(app, { initialUrl: "/profile/purchases" });
    expect(await screen.findByText("No purchases yet")).toBeTruthy();
  });
});
