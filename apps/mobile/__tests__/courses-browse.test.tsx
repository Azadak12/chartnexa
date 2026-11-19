import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { courseApi } from "../src/courses/course-api";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { appError, pair } from "../test-utils/auth-mocks";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(), get: jest.fn() },
}));
jest.mock("../src/reviews/review-api", () => ({
  reviewsApi: {
    list: jest.fn(async () => ({ items: [], nextCursor: null })),
    mine: jest.fn(async () => ({ review: null })),
    write: jest.fn(),
    remove: jest.fn(),
  },
}));
jest.mock("../src/auth/account-api", () => ({
  accountApi: {
    me: jest.fn().mockResolvedValue({
      id: "u1",
      email: "a@b.co",
      displayName: null,
      emailVerified: true,
      createdAt: "2026-11-17T00:00:00.000Z",
    }),
    resendVerification: jest.fn(),
  },
}));

const api = courseApi as unknown as { list: jest.Mock; get: jest.Mock };
const secure = SecureStore as unknown as { __reset: () => void };
const app = "./app";

const course = (n: number, over: Record<string, unknown> = {}) => ({
  id: `c${n}`,
  title: `Course ${n}`,
  summary: `Summary of course ${n}`,
  level: "beginner",
  priceCents: n === 2 ? 0 : 4900 + n,
  currency: "USD",
  coverTone: "blue",
  publishedAt: "2026-11-17T00:00:00.000Z",
  ...over,
});
const page = (items: unknown[], nextCursor: string | null = null) => ({ items, nextCursor });
const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);
const wait = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  api.list.mockResolvedValue(page([course(1), course(2), course(3)]));
});

describe("catalog in Explore", () => {
  it("shows published courses as cards with level and price, and Free for zero", async () => {
    await renderRouter(app, { initialUrl: "/explore" });
    expect(await screen.findByTestId("course-c1")).toBeTruthy();
    expect(screen.getByLabelText("Course 1, Beginner, $49.01, No reviews yet")).toBeTruthy();
    expect(screen.getByLabelText("Course 2, Beginner, Free, No reviews yet")).toBeTruthy();
    expect(api.list).toHaveBeenCalledWith({});
  });

  it("searches after typing pauses and filters by level, then clears both", async () => {
    await renderRouter(app, { initialUrl: "/explore" });
    await screen.findByTestId("course-c1");
    api.list.mockResolvedValue(page([course(4, { title: "Options Greeks" })]));
    await type("Search courses", "greeks");
    expect(api.list).not.toHaveBeenCalledWith(expect.objectContaining({ q: "greeks" }));
    await wait(350);
    await waitFor(() => expect(api.list).toHaveBeenCalledWith({ q: "greeks" }));
    expect(await screen.findByText("Options Greeks")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Advanced" }));
    await waitFor(() => expect(api.list).toHaveBeenCalledWith({ q: "greeks", level: "advanced" }));
    expect(screen.getByRole("button", { name: "Advanced" }).props.accessibilityState.selected).toBe(
      true,
    );
    expect(
      screen.getByRole("button", { name: "All levels" }).props.accessibilityState.selected,
    ).toBe(false);
  });

  it("says nothing matched and offers to clear the search and filters", async () => {
    await renderRouter(app, { initialUrl: "/explore" });
    await screen.findByTestId("course-c1");
    api.list.mockResolvedValue(page([]));
    await type("Search courses", "zzz");
    await wait(350);
    expect(await screen.findByText("No courses match")).toBeTruthy();
    api.list.mockResolvedValue(page([course(1)]));
    await fireEvent.press(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(await screen.findByTestId("course-c1")).toBeTruthy();
    expect(screen.getByLabelText("Search courses").props.value).toBe("");
  });

  it("shows the empty state, the error state with a working Retry, and the offline state", async () => {
    api.list.mockResolvedValue(page([]));
    const { unmount } = await renderRouter(app, { initialUrl: "/explore" });
    expect(await screen.findByText("No courses yet")).toBeTruthy();
    await unmount();
    clearScreenMemory();

    api.list.mockRejectedValueOnce(appError("forbidden")).mockResolvedValue(page([course(1)]));
    const second = await renderRouter(app, { initialUrl: "/explore" });
    expect(await second.findByTestId("state-error")).toBeTruthy();
    await fireEvent.press(second.getByRole("button", { name: "Retry" }));
    expect(await second.findByTestId("course-c1")).toBeTruthy();
    await second.unmount();
    clearScreenMemory();

    api.list.mockRejectedValue(appError("network"));
    const third = await renderRouter(app, { initialUrl: "/explore" });
    expect(await third.findByTestId("state-offline", undefined, { timeout: 8000 })).toBeTruthy();
  });

  it("loads the next page when the list reaches the end, once", async () => {
    api.list
      .mockResolvedValueOnce(page([course(1)], "cursor-1"))
      .mockResolvedValueOnce(page([course(5)], null));
    await renderRouter(app, { initialUrl: "/explore" });
    await screen.findByTestId("course-c1");
    await fireEvent(screen.getByTestId("catalog-list"), "endReached");
    expect(await screen.findByTestId("course-c5")).toBeTruthy();
    expect(api.list).toHaveBeenLastCalledWith({ cursor: "cursor-1" });
    // No further pages: reaching the end again does not ask again.
    api.list.mockClear();
    await fireEvent(screen.getByTestId("catalog-list"), "endReached");
    expect(api.list).not.toHaveBeenCalled();
    expect(screen.getByTestId("course-c1")).toBeTruthy();
  });

  it("remembers search text and level after opening a course and going back", async () => {
    await renderRouter(app, { initialUrl: "/explore" });
    await screen.findByTestId("course-c1");
    await fireEvent.press(screen.getByRole("button", { name: "Intermediate" }));
    api.list.mockResolvedValue(page([course(7, { level: "intermediate" })]));
    await type("Search courses", "price");
    await wait(350);
    await screen.findByTestId("course-c7");
    await fireEvent.press(screen.getByTestId("course-c7"));
    expect(screen).toHavePathname("/course/c7");
    await act(async () => router.back());
    expect(screen).toHavePathname("/explore");
    expect(
      screen.getByRole("button", { name: "Intermediate" }).props.accessibilityState.selected,
    ).toBe(true);
    expect(screen.getByLabelText("Search courses").props.value).toBe("price");
  });
});

describe("course page", () => {
  const detail = {
    id: "c1",
    title: "Price Action Basics",
    description: "Learn to read charts the simple way.",
    level: "advanced",
    priceCents: 4950,
    currency: "USD",
    coverTone: "black",
    publishedAt: "2026-11-17T00:00:00.000Z",
  };

  it("shows the cover, title, level, price, description and a test-mode buy button", async () => {
    api.get.mockResolvedValue(detail);
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByRole("header", { name: "Price Action Basics" })).toBeTruthy();
    expect(screen.getByText("Advanced")).toBeTruthy();
    expect(screen.getByTestId("course-price").props.children).toBe("$49.50");
    expect(screen.getByText("Learn to read charts the simple way.")).toBeTruthy();
    expect(screen.getByTestId("enroll-notice").props.accessibilityLabel).toMatch(
      /Buy this course|free/,
    );
    expect(await screen.findByRole("button", { name: "Buy for $49.50" })).toBeTruthy();
    expect(screen.getByText("Test mode: no money is charged.")).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith("c1");
  });

  it("shows a friendly not-found state with a way back when the course is gone", async () => {
    api.get.mockRejectedValue(appError("not_found"));
    await renderRouter(app, { initialUrl: "/course/gone" });
    expect(await screen.findByText("Course not found")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back to courses" }));
    expect(screen).toHavePathname("/explore");
  });

  it("shows loading, then an error with Retry", async () => {
    api.get.mockRejectedValueOnce(appError("forbidden")).mockResolvedValue(detail);
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByTestId("state-error")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("header", { name: "Price Action Basics" })).toBeTruthy();
  });

  it("takes a signed-out person to sign-in and back to the same course", async () => {
    api.get.mockResolvedValue(detail);
    await sessionManager.signOut();
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(screen).toHavePathname("/sign-in");
    expect(screen).toHaveSearchParams({ returnTo: "/course/c1" });
    await act(async () => sessionStore.set("signed-in"));
    expect(screen).toHavePathname("/course/c1");
    expect(await screen.findByRole("header", { name: "Price Action Basics" })).toBeTruthy();
  });
});
