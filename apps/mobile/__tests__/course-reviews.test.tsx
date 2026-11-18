import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import * as SecureStore from "expo-secure-store";
import { courseApi } from "../src/courses/course-api";
import { lessonApi } from "../src/lessons/lesson-api";
import { progressApi } from "../src/progress/progress-api";
import { reviewsApi } from "../src/reviews/review-api";
import { ratingText } from "../src/reviews/RatingSummary";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
}));
jest.mock("../src/lessons/lesson-api", () => ({
  lessonApi: { outline: jest.fn(async () => ({ items: [] })), get: jest.fn() },
  staffLessonApi: {},
}));
jest.mock("../src/progress/progress-api", () => ({
  progressApi: {
    read: jest.fn(async () => ({ completed: 0, total: 0, nextLessonId: null, lessons: [] })),
    mark: jest.fn(),
    unmark: jest.fn(),
  },
}));
jest.mock("../src/reviews/review-api", () => ({
  reviewsApi: {
    list: jest.fn(),
    mine: jest.fn(),
    write: jest.fn(),
    remove: jest.fn(),
    report: jest.fn(),
    appeal: jest.fn(),
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

const courses = courseApi as unknown as { get: jest.Mock; list: jest.Mock };
const api = reviewsApi as unknown as Record<"list" | "mine" | "write" | "remove", jest.Mock>;
const secure = SecureStore as unknown as { __reset: () => void };
const app = "./app";
void lessonApi;
void progressApi;

const detail = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  title: "Price Action Basics",
  description: "Learn to read charts.",
  level: "beginner",
  priceCents: 4900,
  currency: "USD",
  coverTone: "blue",
  publishedAt: "2026-11-17T00:00:00.000Z",
  lessonCount: 0,
  previewCount: 0,
  enrolled: false,
  onSale: true,
  progress: null,
  nextLessonId: null,
  rating: { count: 12, average: 4.5 },
  ...over,
});
const review = (n: number, over: Record<string, unknown> = {}) => ({
  id: `r${n}`,
  rating: 1 + (n % 5),
  body: `Review text ${n}`,
  createdAt: `2026-11-${String(10 + (n % 15)).padStart(2, "0")}T10:00:00.000Z`,
  updatedAt: "2026-11-18T10:00:00.000Z",
  reviewerName: n % 2 ? "Student" : `Person ${n}`,
  mine: false,
  ...over,
});
const page = (items: unknown[], nextCursor: string | null = null) => ({ items, nextCursor });
const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));
const star = (n: number) =>
  fireEvent.press(screen.getByRole("radio", { name: `${n} ${n === 1 ? "star" : "stars"}` }));

beforeEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  courses.get.mockResolvedValue(detail());
  api.list.mockResolvedValue(page([review(1), review(2)]));
  api.mine.mockResolvedValue({ review: null });
});

describe("rating summaries", () => {
  it("say it in words, with singular and plural, and 'No reviews yet' for none", () => {
    expect(ratingText({ count: 12, average: 4.5 })).toBe("4.5 · 12 reviews");
    expect(ratingText({ count: 1, average: 4 })).toBe("4.0 · 1 review");
    expect(ratingText({ count: 0, average: null })).toBe("No reviews yet");
    expect(ratingText(undefined)).toBe("No reviews yet");
  });

  it("show on the course page with a spoken label, and on catalog cards", async () => {
    courses.list.mockResolvedValue({
      items: [
        {
          id: "c1",
          title: "Course 1",
          summary: "s",
          level: "beginner",
          priceCents: 4900,
          currency: "USD",
          coverTone: "blue",
          publishedAt: "2026-11-17T00:00:00.000Z",
          rating: { count: 12, average: 4.5 },
        },
      ],
      nextCursor: null,
    });
    await renderRouter(app, { initialUrl: "/home" });
    expect(
      await screen.findByLabelText("Course 1, Beginner, $49.00, 4.5 · 12 reviews"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Rated 4.5 · 12 reviews")).toBeTruthy();
    await screen.unmount();

    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByTestId("course-rating")).toBeTruthy();
    expect(screen.getAllByLabelText("Rated 4.5 · 12 reviews").length).toBeGreaterThanOrEqual(1);
  });
});

describe("the reviews list", () => {
  it("lists reviews with stars as words, names and dates", async () => {
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByTestId("review-r1")).toBeTruthy();
    expect(screen.getByText("Review text 1")).toBeTruthy();
    expect(screen.getByText("2 stars · Student")).toBeTruthy();
    expect(screen.getByText("3 stars · Person 2")).toBeTruthy();
    expect(screen.getByLabelText(/^2 stars, Student/)).toBeTruthy();
  });

  it("marks the person's own review", async () => {
    api.list.mockResolvedValue(page([review(1, { mine: true })]));
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByText("2 stars · Student (you)")).toBeTruthy();
  });

  it("says 'No reviews yet' when there are none", async () => {
    courses.get.mockResolvedValue(detail({ rating: { count: 0, average: null } }));
    api.list.mockResolvedValue(page([]));
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByTestId("reviews-empty")).toBeTruthy();
  });

  it("loads the next page on Show more reviews, in order and without repeats", async () => {
    api.list
      .mockResolvedValueOnce(page([review(1), review(2)], "cursor-1"))
      .mockResolvedValueOnce(page([review(3), review(4)], "cursor-2"))
      .mockResolvedValueOnce(page([review(5)], null));
    await renderRouter(app, { initialUrl: "/course/c1" });
    await screen.findByTestId("review-r1");
    await press("Show more reviews");
    await screen.findByTestId("review-r3");
    expect(api.list).toHaveBeenLastCalledWith("c1", "cursor-1");
    await press("Show more reviews");
    await screen.findByTestId("review-r5");
    expect(api.list).toHaveBeenLastCalledWith("c1", "cursor-2");
    expect(screen.queryByRole("button", { name: "Show more reviews" })).toBeNull();
    expect(screen.getAllByTestId(/^review-r\d$/)).toHaveLength(5);
  });

  it("fails on its own with Retry and leaves the page usable", async () => {
    api.list.mockRejectedValueOnce(appError("unknown")).mockResolvedValue(page([review(1)]));
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByTestId("state-error")).toBeTruthy();
    expect(screen.getByText("Price Action Basics")).toBeTruthy();
    await press("Retry");
    expect(await screen.findByTestId("review-r1")).toBeTruthy();
  });
});

describe("who sees the review controls", () => {
  it("shows none to someone who does not own the course, and never asks for their review", async () => {
    await renderRouter(app, { initialUrl: "/course/c1" });
    await screen.findByTestId("review-r1");
    expect(screen.queryByRole("button", { name: "Write a review" })).toBeNull();
    expect(api.mine).not.toHaveBeenCalled();
  });

  it("shows Write a review to an owner who has not reviewed", async () => {
    courses.get.mockResolvedValue(detail({ enrolled: true }));
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByRole("button", { name: "Write a review" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete your review" })).toBeNull();
  });

  it("shows Edit and Delete to an owner who has reviewed", async () => {
    courses.get.mockResolvedValue(detail({ enrolled: true }));
    api.mine.mockResolvedValue({ review: review(9, { mine: true, rating: 4, body: "Mine" }) });
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByRole("button", { name: "Edit your review" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete your review" })).toBeTruthy();
  });
});

describe("writing a review", () => {
  const open = async () => {
    courses.get.mockResolvedValue(detail({ enrolled: true }));
    await renderRouter(app, { initialUrl: "/course/c1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Write a review" }));
    await screen.findByRole("radio", { name: "5 stars" });
  };

  it("exposes five labelled star choices, says which is chosen, and announces the save", async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    api.write.mockResolvedValue(review(9, { mine: true, rating: 4 }));
    await open();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByRole("radio", { name: "1 star" })).toBeTruthy();
    expect(screen.getByTestId("rating-label").props.children).toBe("No rating chosen");
    await star(4);
    expect(screen.getByRole("radio", { name: "4 stars" }).props.accessibilityState.checked).toBe(
      true,
    );
    expect(screen.getByRole("radio", { name: "3 stars" }).props.accessibilityState.checked).toBe(
      false,
    );
    expect(screen.getByTestId("rating-label").props.children).toBe("4 stars");
    await type("Your review (optional)", "  Clear and useful.  ");
    await press("Save review");
    await waitFor(() =>
      expect(api.write).toHaveBeenCalledWith("c1", { rating: 4, body: "Clear and useful." }),
    );
    await waitFor(() => expect(screen.queryByRole("radio", { name: "5 stars" })).toBeNull());
    expect(announce).toHaveBeenCalledWith("Review saved");
  });

  it("refreshes the list, the person's review and the summary after saving", async () => {
    api.write.mockResolvedValue(review(9, { mine: true }));
    await open();
    const lists = api.list.mock.calls.length;
    const details = courses.get.mock.calls.length;
    await star(5);
    await press("Save review");
    await waitFor(() => expect(api.list.mock.calls.length).toBeGreaterThan(lists));
    await waitFor(() => expect(courses.get.mock.calls.length).toBeGreaterThan(details));
    expect(api.mine.mock.calls.length).toBeGreaterThan(1);
  });

  it("counts characters and refuses no star or too much text, keeping what was typed", async () => {
    await open();
    await type("Your review (optional)", "Some text");
    expect(screen.getByTestId("review-count").props.children.join("")).toBe("9 / 1,000");
    await press("Save review");
    expect(await screen.findByTestId("rating-error")).toBeTruthy();
    expect(screen.getByText("Choose a rating from 1 to 5 stars")).toBeTruthy();
    await star(3);
    await type("Your review (optional)", "x".repeat(1001));
    await press("Save review");
    expect(await screen.findByText(/1,000 characters or fewer/)).toBeTruthy();
    expect(api.write).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Your review (optional)").props.value).toHaveLength(1001);
  });

  it("sends one request when Save is pressed twice quickly", async () => {
    let finish!: () => void;
    api.write.mockImplementation(
      () => new Promise((r) => (finish = () => r(review(9, { mine: true })))),
    );
    await open();
    await star(5);
    const b = screen.getByRole("button", { name: "Save review" });
    await fireEvent.press(b);
    await fireEvent.press(b);
    expect(api.write).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it("keeps the text after a dropped connection and saves the same review on retry", async () => {
    api.write
      .mockRejectedValueOnce(appError("network"))
      .mockResolvedValue(review(9, { mine: true }));
    await open();
    await star(2);
    await type("Your review (optional)", "Typed text");
    await press("Save review");
    expect(await screen.findByTestId("review-error")).toBeTruthy();
    expect(screen.getByLabelText("Your review (optional)").props.value).toBe("Typed text");
    await press("Save review");
    await waitFor(() => expect(api.write).toHaveBeenCalledTimes(2));
    expect(api.write.mock.calls[1]).toEqual(["c1", { rating: 2, body: "Typed text" }]);
  });

  it("explains lost access, keeps the text and refreshes the course page", async () => {
    api.write.mockRejectedValue(
      Object.assign(appError("forbidden"), { code: "ENROLLMENT_REQUIRED" }),
    );
    await open();
    await star(5);
    await type("Your review (optional)", "Still here");
    const before = courses.get.mock.calls.length;
    await press("Save review");
    expect(await screen.findByText(/no longer have access to this course/)).toBeTruthy();
    expect(screen.getByLabelText("Your review (optional)").props.value).toBe("Still here");
    await waitFor(() => expect(courses.get.mock.calls.length).toBeGreaterThan(before));
  });

  it("shows a server field error beside the field", async () => {
    api.write.mockRejectedValue(
      appError("validation", { fields: [{ field: "body", message: "Use plain text only" }] }),
    );
    await open();
    await star(5);
    await press("Save review");
    expect(await screen.findByText("Use plain text only")).toBeTruthy();
  });

  it("closes with Cancel without sending anything", async () => {
    await open();
    await star(5);
    await press("Cancel");
    await waitFor(() => expect(screen.queryByRole("radio", { name: "5 stars" })).toBeNull());
    expect(api.write).not.toHaveBeenCalled();
  });
});

describe("editing and deleting", () => {
  const own = review(9, { mine: true, rating: 4, body: "Original text" });
  const openOwn = async () => {
    courses.get.mockResolvedValue(detail({ enrolled: true }));
    api.mine.mockResolvedValue({ review: own });
    await renderRouter(app, { initialUrl: "/course/c1" });
  };

  it("opens the sheet with the saved rating and text, and saves changes", async () => {
    api.write.mockResolvedValue({ ...own, rating: 5, body: "Better" });
    await openOwn();
    await fireEvent.press(await screen.findByRole("button", { name: "Edit your review" }));
    await screen.findByRole("radio", { name: "4 stars" });
    expect(screen.getByRole("radio", { name: "4 stars" }).props.accessibilityState.checked).toBe(
      true,
    );
    expect(screen.getByLabelText("Your review (optional)").props.value).toBe("Original text");
    await star(5);
    await type("Your review (optional)", "Better");
    await press("Save review");
    await waitFor(() =>
      expect(api.write).toHaveBeenCalledWith("c1", { rating: 5, body: "Better" }),
    );
  });

  it("asks before deleting, names the effect, and does nothing on Cancel", async () => {
    await openOwn();
    await fireEvent.press(await screen.findByRole("button", { name: "Delete your review" }));
    expect(await screen.findByText("Delete your review?")).toBeTruthy();
    expect(screen.getByText(/rating will be updated/)).toBeTruthy();
    await press("Cancel");
    expect(api.remove).not.toHaveBeenCalled();
  });

  it("deletes after confirming, refreshes everything and announces it", async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    api.remove.mockResolvedValue({ deleted: true });
    await openOwn();
    await fireEvent.press(await screen.findByRole("button", { name: "Delete your review" }));
    await screen.findByText("Delete your review?");
    const lists = api.list.mock.calls.length;
    api.mine.mockResolvedValue({ review: null });
    await press("Delete review");
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(api.list.mock.calls.length).toBeGreaterThan(lists));
    expect(announce).toHaveBeenCalledWith("Review deleted");
    expect(await screen.findByRole("button", { name: "Write a review" })).toBeTruthy();
  });

  it("explains a refused delete without removing anything on screen", async () => {
    api.remove.mockRejectedValue(
      Object.assign(appError("forbidden"), { code: "ENROLLMENT_REQUIRED" }),
    );
    await openOwn();
    await fireEvent.press(await screen.findByRole("button", { name: "Delete your review" }));
    await screen.findByText("Delete your review?");
    await press("Delete review");
    expect(await screen.findByTestId("reviews-error")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit your review" })).toBeTruthy();
  });
});
