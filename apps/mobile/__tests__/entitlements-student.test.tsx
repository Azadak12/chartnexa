import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { courseApi } from "../src/courses/course-api";
import { myCoursesApi } from "../src/entitlements/entitlement-api";
import { lessonApi } from "../src/lessons/lesson-api";
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
jest.mock("../src/progress/progress-api", () => ({
  progressApi: {
    read: jest.fn(async () => ({ completed: 0, total: 2, nextLessonId: "l1", lessons: [] })),
    mark: jest.fn(),
    unmark: jest.fn(),
  },
}));
jest.mock("../src/entitlements/entitlement-api", () => ({
  myCoursesApi: { list: jest.fn() },
  staffEntitlementApi: {},
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
const secure = SecureStore as unknown as { __reset: () => void };
const app = "./app";

const owned = (n: number, over: Record<string, unknown> = {}) => ({
  id: `c${n}`,
  title: `Course ${n}`,
  summary: `Summary ${n}`,
  level: "beginner",
  priceCents: 4900,
  currency: "USD",
  coverTone: "blue",
  onSale: true,
  enrolledAt: "2026-11-18T00:00:00.000Z",
  progress: { completed: 0, total: 0 },
  ...over,
});
const page = (items: unknown[], nextCursor: string | null = null) => ({ items, nextCursor });
const detail = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  title: "Price Action Basics",
  description: "Learn to read charts.",
  level: "beginner",
  priceCents: 4900,
  currency: "USD",
  coverTone: "blue",
  publishedAt: "2026-11-17T00:00:00.000Z",
  lessonCount: 2,
  previewCount: 1,
  enrolled: true,
  onSale: true,
  ...over,
});
const outline = [
  { id: "l1", title: "Free intro", position: 1, isPreview: true },
  { id: "l2", title: "Locked lesson", position: 2, isPreview: false },
];
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  mine.list.mockResolvedValue(page([owned(1), owned(2, { onSale: false })]));
  courses.get.mockResolvedValue(detail());
  lessons.outline.mockResolvedValue({ items: outline });
});

describe("My Learning summary and filters", () => {
  beforeEach(() => {
    mine.list.mockResolvedValue(
      page([
        owned(1, { progress: { completed: 2, total: 5 } }),
        owned(2, { progress: { completed: 4, total: 4 } }),
        owned(3, { progress: { completed: 0, total: 3 } }),
      ]),
    );
  });

  it("sums real lesson progress and counts completed courses", async () => {
    await renderRouter(app, { initialUrl: "/courses" });
    expect(await screen.findByTestId("learning-summary")).toBeTruthy();
    expect(screen.getByText("6 of 12 lessons done")).toBeTruthy();
    expect(screen.getByText("1 of 3 courses completed")).toBeTruthy();
  });

  it("filters to In Progress and Completed, and offers a way back from an empty filter", async () => {
    await renderRouter(app, { initialUrl: "/courses" });
    await screen.findByTestId("my-course-c1");
    await press("Completed");
    expect(screen.queryByTestId("my-course-c1")).toBeNull();
    expect(screen.getByTestId("my-course-c2")).toBeTruthy();
    await press("In Progress");
    expect(screen.getByTestId("my-course-c1")).toBeTruthy();
    expect(screen.getByTestId("my-course-c3")).toBeTruthy();
    expect(screen.queryByTestId("my-course-c2")).toBeNull();

    mine.list.mockResolvedValue(page([owned(1, { progress: { completed: 2, total: 5 } })]));
  });

  it("says nothing is completed yet when no course is finished", async () => {
    mine.list.mockResolvedValue(page([owned(1, { progress: { completed: 2, total: 5 } })]));
    await renderRouter(app, { initialUrl: "/courses" });
    await screen.findByTestId("my-course-c1");
    await press("Completed");
    expect(await screen.findByText("Nothing completed yet")).toBeTruthy();
    await press("Show all courses");
    expect(screen.getByTestId("my-course-c1")).toBeTruthy();
  });
});

describe("My Courses", () => {
  it("lists owned courses and says in text when one is not on sale", async () => {
    await renderRouter(app, { initialUrl: "/courses" });
    expect(await screen.findByTestId("my-course-c1")).toBeTruthy();
    expect(screen.getByLabelText("Course 1, Beginner, No lessons yet")).toBeTruthy();
    expect(
      screen.getByLabelText("Course 2, Beginner, not currently on sale, No lessons yet"),
    ).toBeTruthy();
    expect(screen.getByTestId("not-on-sale-c2")).toBeTruthy();
    expect(screen.queryByTestId("not-on-sale-c1")).toBeNull();
  });

  it("opens the course page from a card", async () => {
    await renderRouter(app, { initialUrl: "/courses" });
    await fireEvent.press(await screen.findByTestId("my-course-c2"));
    expect(screen).toHavePathname("/course/c2");
  });

  it("shows an empty state with a way to browse", async () => {
    mine.list.mockResolvedValue(page([]));
    await renderRouter(app, { initialUrl: "/courses" });
    expect(await screen.findByText("You have not enrolled in any courses yet")).toBeTruthy();
    await press("Browse courses");
    expect(screen).toHavePathname("/explore");
  });

  it("shows an error with Retry, and an offline state", async () => {
    mine.list.mockRejectedValueOnce(appError("unknown")).mockResolvedValue(page([owned(1)]));
    const first = await renderRouter(app, { initialUrl: "/courses" });
    expect(await first.findByTestId("state-error")).toBeTruthy();
    await fireEvent.press(first.getByRole("button", { name: "Retry" }));
    expect(await first.findByTestId("my-course-c1")).toBeTruthy();
  });

  it("loads the next page when the list reaches the end", async () => {
    mine.list
      .mockResolvedValueOnce(page([owned(1)], "cursor-1"))
      .mockResolvedValueOnce(page([owned(2)], null));
    await renderRouter(app, { initialUrl: "/courses" });
    await screen.findByTestId("my-course-c1");
    await fireEvent(screen.getByTestId("my-courses-list"), "endReached");
    expect(await screen.findByTestId("my-course-c2")).toBeTruthy();
    expect(mine.list).toHaveBeenLastCalledWith("cursor-1");
  });
});

describe("the course page for an owner", () => {
  it("says they are enrolled in text and drops the enrollment-coming notice", async () => {
    await renderRouter(app, { initialUrl: "/course/c1?tab=curriculum" });
    expect(await screen.findByTestId("enrolled-notice")).toBeTruthy();
    expect(screen.getByLabelText(/You are enrolled in this course/)).toBeTruthy();
    expect(screen.queryByTestId("enroll-notice")).toBeNull();
    expect(screen.queryByTestId("not-on-sale")).toBeNull();
  });

  it("explains an unpublished course and keeps their access", async () => {
    courses.get.mockResolvedValue(detail({ onSale: false, publishedAt: null }));
    await renderRouter(app, { initialUrl: "/course/c1?tab=curriculum" });
    expect(await screen.findByTestId("not-on-sale")).toBeTruthy();
    expect(screen.getByText(/You keep your access/)).toBeTruthy();
  });

  it("opens a lesson that is not a free preview, with no locked sheet", async () => {
    lessons.get.mockResolvedValue({ ...outline[1], body: "Owner text" });
    await renderRouter(app, { initialUrl: "/course/c1?tab=curriculum" });
    expect(await screen.findByLabelText("Lesson 2: Locked lesson, included")).toBeTruthy();
    expect(screen.queryByText("Locked")).toBeNull();
    await fireEvent.press(screen.getByTestId("lesson-l2"));
    expect(await screen.findByText("Owner text")).toBeTruthy();
    expect(screen).toHavePathname("/course/c1/lesson/l2");
    expect(screen.queryByText("This lesson is locked")).toBeNull();
  });

  it("keeps the notice and the locked sheet for someone who is not enrolled", async () => {
    courses.get.mockResolvedValue(detail({ enrolled: false }));
    await renderRouter(app, { initialUrl: "/course/c1?tab=curriculum" });
    expect(await screen.findByTestId("enroll-notice")).toBeTruthy();
    expect(screen.queryByTestId("enrolled-notice")).toBeNull();
    await fireEvent.press(await screen.findByTestId("lesson-l2"));
    expect(await screen.findByText("This lesson is locked")).toBeTruthy();
    expect(lessons.get).not.toHaveBeenCalled();
  });
});

describe("losing access while reading", () => {
  it("shows a no-access state instead of any text, and refreshes the course page", async () => {
    lessons.get.mockRejectedValue(
      Object.assign(appError("forbidden"), { code: "ENROLLMENT_REQUIRED" }),
    );
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l2" });
    expect(await screen.findByText("You no longer have access to this lesson")).toBeTruthy();
    expect(screen.queryByTestId("lesson-body")).toBeNull();
    await press("Back to course");
    expect(screen).toHavePathname("/course/c1");
  });

  it("refetches the course so it stops showing the person as enrolled", async () => {
    courses.get.mockResolvedValueOnce(detail()).mockResolvedValue(detail({ enrolled: false }));
    lessons.get.mockRejectedValue(
      Object.assign(appError("forbidden"), { code: "ENROLLMENT_REQUIRED" }),
    );
    await renderRouter(app, { initialUrl: "/course/c1?tab=curriculum" });
    expect(await screen.findByTestId("enrolled-notice")).toBeTruthy();
    await fireEvent.press(await screen.findByTestId("lesson-l2"));
    expect(await screen.findByText("You no longer have access to this lesson")).toBeTruthy();
    await act(async () => void (await press("Back to course")));
    await waitFor(() => expect(screen.queryByTestId("enrolled-notice")).toBeNull());
    expect(await screen.findByTestId("enroll-notice")).toBeTruthy();
  });
});
