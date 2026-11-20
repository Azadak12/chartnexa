import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import * as SecureStore from "expo-secure-store";
import { courseApi } from "../src/courses/course-api";
import { myCoursesApi } from "../src/entitlements/entitlement-api";
import { lessonApi } from "../src/lessons/lesson-api";
import { progressApi } from "../src/progress/progress-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
}));
jest.mock("../src/lessons/lesson-api", () => ({
  lessonApi: { outline: jest.fn(), get: jest.fn() },
  staffLessonApi: {},
}));
jest.mock("../src/entitlements/entitlement-api", () => ({
  myCoursesApi: { list: jest.fn() },
  staffEntitlementApi: {},
}));
jest.mock("../src/progress/progress-api", () => ({
  progressApi: { read: jest.fn(), mark: jest.fn(), unmark: jest.fn() },
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

const courses = courseApi as unknown as { get: jest.Mock };
const lessons = lessonApi as unknown as { outline: jest.Mock; get: jest.Mock };
const mine = myCoursesApi as unknown as { list: jest.Mock };
const api = progressApi as unknown as Record<"read" | "mark" | "unmark", jest.Mock>;
const secure = SecureStore as unknown as { __reset: () => void };
const app = "./app";

const outline = [
  { id: "l1", title: "First", position: 1, isPreview: true },
  { id: "l2", title: "Second", position: 2, isPreview: false },
  { id: "l3", title: "Third", position: 3, isPreview: false },
];
const detail = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  title: "Price Action Basics",
  description: "Learn to read charts.",
  level: "beginner",
  priceCents: 4900,
  currency: "USD",
  coverTone: "blue",
  publishedAt: "2026-11-17T00:00:00.000Z",
  lessonCount: 3,
  previewCount: 1,
  enrolled: true,
  onSale: true,
  progress: { completed: 1, total: 3 },
  nextLessonId: "l2",
  ...over,
});
const progress = (ids: string[], over: Record<string, unknown> = {}) => ({
  completed: ids.length,
  total: 3,
  nextLessonId: "l2",
  lessons: ids.map((lessonId) => ({ lessonId, completedAt: "2026-11-18T00:00:00.000Z" })),
  ...over,
});
const lesson = (id = "l2", body = "Paragraph one.\n\nParagraph two.") => ({
  id,
  title: `Lesson ${id}`,
  position: Number(id.slice(1)),
  isPreview: false,
  body,
});
/** Stands in for the server: reads reflect what was marked, as the real API does. */
let done: Set<string>;
const wireProgress = (initial: string[]) => {
  done = new Set(initial);
  api.read.mockImplementation(async () => progress([...done]));
  api.mark.mockImplementation(async (_c: string, l: string) => {
    done.add(l);
    return { completed: true, completedAt: "2026-11-18T01:00:00.000Z" };
  });
  api.unmark.mockImplementation(async (_c: string, l: string) => {
    done.delete(l);
    return { completed: false };
  });
};
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  courses.get.mockResolvedValue(detail());
  lessons.outline.mockResolvedValue({ items: outline });
  lessons.get.mockResolvedValue(lesson());
  wireProgress(["l1"]);
  mine.list.mockResolvedValue({ items: [], nextCursor: null });
});

describe("marking a lesson in the reader", () => {
  it("offers Mark as complete to an owner on every step and in Show all text", async () => {
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l2" });
    expect(await screen.findByRole("button", { name: "Mark as complete" })).toBeTruthy();
    await press("Next");
    expect(screen.getByRole("button", { name: "Mark as complete" })).toBeTruthy();
    await press("Show all text");
    expect(await screen.findByRole("button", { name: "Mark as complete" })).toBeTruthy();
    expect(api.read).toHaveBeenCalledWith("c1");
  });

  it("shows nothing for someone who does not own the course, and never asks for progress", async () => {
    courses.get.mockResolvedValue(detail({ enrolled: false, progress: null, nextLessonId: null }));
    lessons.get.mockResolvedValue(lesson("l1"));
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l1" });
    await screen.findByText("Paragraph one.");
    expect(screen.queryByTestId("completion-control")).toBeNull();
    expect(screen.queryByTestId("lesson-completion-panel")).toBeNull();
    expect(api.read).not.toHaveBeenCalled();
  });

  it("marks complete, says so in text, announces it, and refreshes the course", async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l2" });
    await screen.findByRole("button", { name: "Mark as complete" });
    const before = courses.get.mock.calls.length;
    await press("Mark as complete");
    expect(await screen.findByTestId("lesson-completed")).toBeTruthy();
    expect(screen.getByText("✓ Completed")).toBeTruthy();
    expect(screen.getByTestId("lesson-completion-panel")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark as not complete" })).toBeTruthy();
    expect(api.mark).toHaveBeenCalledWith("c1", "l2");
    expect(announce).toHaveBeenCalledWith("Lesson marked complete");
    await waitFor(() => expect(courses.get.mock.calls.length).toBeGreaterThan(before));
  });

  it("undoes a completion", async () => {
    wireProgress(["l2"]);
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l2" });
    expect(await screen.findByTestId("lesson-completed")).toBeTruthy();
    await press("Mark as not complete");
    expect(await screen.findByRole("button", { name: "Mark as complete" })).toBeTruthy();
    expect(screen.queryByTestId("lesson-completed")).toBeNull();
    expect(api.unmark).toHaveBeenCalledWith("c1", "l2");
    expect(screen.queryByTestId("lesson-completion-panel")).toBeNull();
  });

  it("sends one request when the button is pressed twice quickly", async () => {
    let finish!: () => void;
    api.mark.mockImplementation(
      () => new Promise((r) => (finish = () => r({ completed: true, completedAt: "t" }))),
    );
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l2" });
    const b = await screen.findByRole("button", { name: "Mark as complete" });
    await fireEvent.press(b);
    await fireEvent.press(b);
    expect(api.mark).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it("keeps the old state on failure, explains, and works on retry", async () => {
    const real = api.mark.getMockImplementation()!;
    api.mark.mockRejectedValueOnce(appError("network"));
    api.mark.mockImplementation(real);
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l2" });
    await screen.findByRole("button", { name: "Mark as complete" });
    await press("Mark as complete");
    expect(await screen.findByTestId("completion-error")).toBeTruthy();
    expect(screen.queryByTestId("lesson-completed")).toBeNull();
    await press("Mark as complete");
    expect(await screen.findByTestId("lesson-completed")).toBeTruthy();
    expect(screen.queryByTestId("completion-error")).toBeNull();
  });

  it("shows a no-access message when access has ended, and does not change the state", async () => {
    api.mark.mockRejectedValue(
      Object.assign(appError("forbidden"), { code: "ENROLLMENT_REQUIRED" }),
    );
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l2" });
    await screen.findByRole("button", { name: "Mark as complete" });
    await press("Mark as complete");
    expect(await screen.findByText(/no longer have access to this course/)).toBeTruthy();
    expect(screen.queryByTestId("lesson-completed")).toBeNull();
  });

  it("says when progress could not be loaded, without a broken button", async () => {
    api.read.mockRejectedValue(appError("unknown"));
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l2" });
    expect(await screen.findByTestId("progress-error")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark as complete" })).toBeNull();
  });

  it("shows no control for an empty lesson", async () => {
    lessons.get.mockResolvedValue(lesson("l2", ""));
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l2" });
    expect(await screen.findByText("This lesson has no text yet.")).toBeTruthy();
    expect(screen.queryByTestId("completion-control")).toBeNull();
  });
});

describe("progress on the course page", () => {
  it("shows the count in text with a labelled progress bar", async () => {
    await renderRouter(app, { initialUrl: "/course/c1?tab=curriculum" });
    expect(await screen.findByTestId("course-progress")).toBeTruthy();
    expect(screen.getByText("1 of 3 lessons complete")).toBeTruthy();
    const bar = screen.getByRole("progressbar", { name: "1 of 3 lessons complete" });
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 3, now: 1 });
  });

  it("marks completed lessons in the outline with text", async () => {
    await renderRouter(app, { initialUrl: "/course/c1?tab=curriculum" });
    expect(await screen.findByTestId("completed-l1")).toBeTruthy();
    expect(screen.queryByTestId("completed-l2")).toBeNull();
    expect(screen.getByLabelText("Lesson 1: First, free preview, completed")).toBeTruthy();
    expect(screen.getByLabelText("Lesson 2: Second, included")).toBeTruthy();
  });

  it("Continue opens the next lesson", async () => {
    lessons.get.mockResolvedValue(lesson("l2"));
    await renderRouter(app, { initialUrl: "/course/c1?tab=curriculum" });
    await screen.findByTestId("course-progress");
    await press("Continue");
    expect(screen).toHavePathname("/course/c1/lesson/l2");
  });

  it("offers Review course when everything is complete, opening the first lesson", async () => {
    courses.get.mockResolvedValue(
      detail({ progress: { completed: 3, total: 3 }, nextLessonId: null }),
    );
    lessons.get.mockResolvedValue(lesson("l1"));
    await renderRouter(app, { initialUrl: "/course/c1?tab=curriculum" });
    await screen.findByText("3 of 3 lessons complete");
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    await press("Review course");
    await waitFor(() => expect(screen).toHavePathname("/course/c1/lesson/l1"));
  });

  it("shows 'No lessons yet' and no button for an empty course", async () => {
    courses.get.mockResolvedValue(
      detail({ progress: { completed: 0, total: 0 }, nextLessonId: null, lessonCount: 0 }),
    );
    lessons.outline.mockResolvedValue({ items: [] });
    await renderRouter(app, { initialUrl: "/course/c1?tab=curriculum" });
    expect(await screen.findByText("No lessons yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Review course" })).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows no progress, Continue or outline marks to someone who does not own the course", async () => {
    courses.get.mockResolvedValue(detail({ enrolled: false, progress: null, nextLessonId: null }));
    await renderRouter(app, { initialUrl: "/course/c1?tab=curriculum" });
    await screen.findByTestId("enroll-notice");
    expect(screen.queryByTestId("course-progress")).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(api.read).not.toHaveBeenCalled();
  });

  it("shows the new count after marking a lesson and going back", async () => {
    courses.get
      .mockResolvedValueOnce(detail())
      .mockResolvedValue(detail({ progress: { completed: 2, total: 3 }, nextLessonId: "l3" }));
    lessons.get.mockResolvedValue(lesson("l2"));
    await renderRouter(app, { initialUrl: "/course/c1?tab=curriculum" });
    await screen.findByText("1 of 3 lessons complete");
    await fireEvent.press(screen.getByTestId("lesson-l2"));
    await screen.findByRole("button", { name: "Mark as complete" });
    await press("Mark as complete");
    await screen.findByTestId("lesson-completed");
    await act(async () => void (await press("Back to course")));
    expect(await screen.findByText("2 of 3 lessons complete")).toBeTruthy();
  });
});

describe("progress in My Courses", () => {
  it("shows each course's count in text, a labelled bar, and reads it in the card's name", async () => {
    mine.list.mockResolvedValue({
      items: [
        {
          id: "c1",
          title: "Course 1",
          summary: "s",
          level: "beginner",
          priceCents: 0,
          currency: "USD",
          coverTone: "blue",
          onSale: true,
          enrolledAt: "2026-11-18T00:00:00.000Z",
          progress: { completed: 3, total: 8 },
        },
        {
          id: "c2",
          title: "Course 2",
          summary: "s",
          level: "advanced",
          priceCents: 0,
          currency: "USD",
          coverTone: "black",
          onSale: false,
          enrolledAt: "2026-11-17T00:00:00.000Z",
          progress: { completed: 0, total: 0 },
        },
      ],
      nextCursor: null,
    });
    await renderRouter(app, { initialUrl: "/courses" });
    expect(await screen.findByTestId("progress-c1")).toBeTruthy();
    expect(screen.getByText("3 of 8 lessons complete")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "3 of 8 lessons complete" })).toBeTruthy();
    expect(screen.getByText("No lessons yet")).toBeTruthy();
    expect(screen.getByLabelText("Course 1, Beginner, 3 of 8 lessons complete")).toBeTruthy();
  });
});
