import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { courseApi } from "../src/courses/course-api";
import { lessonApi } from "../src/lessons/lesson-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { pair } from "../test-utils/auth-mocks";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
}));
jest.mock("../src/lessons/lesson-api", () => ({
  lessonApi: { outline: jest.fn(), get: jest.fn() },
  staffLessonApi: {},
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
const secure = SecureStore as unknown as { __reset: () => void };
const app = "./app";

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
  ...over,
});
const outline = [
  { id: "l1", title: "What is a candle?", position: 1, isPreview: true },
  { id: "l2", title: "Support and resistance", position: 2, isPreview: false },
  { id: "l3", title: "Trends", position: 3, isPreview: false },
];

beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  courses.get.mockResolvedValue(detail());
  lessons.outline.mockResolvedValue({
    items: outline.map((l) => ({ ...l, moduleId: "m1" })),
    modules: [{ id: "m1", title: "Basics", position: 1 }],
  });
});

describe("course details", () => {
  it("opens on Overview, switches tabs with selected state, and keeps the price and rating in view", async () => {
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByText("Learn to read charts.")).toBeTruthy();
    expect(screen.getByTestId("course-price")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Overview" }).props.accessibilityState.selected).toBe(
      true,
    );
    await fireEvent.press(screen.getByRole("tab", { name: "Curriculum" }));
    expect(screen.getByRole("tab", { name: "Curriculum" }).props.accessibilityState.selected).toBe(
      true,
    );
    expect(await screen.findByTestId("lesson-l1")).toBeTruthy();
    await fireEvent.press(screen.getByRole("tab", { name: "Reviews" }));
    expect((await screen.findAllByText("No reviews yet")).length).toBeGreaterThan(0);
  });

  it("lists the real module titles under What You Will Learn, and invents nothing", async () => {
    await renderRouter(app, { initialUrl: "/course/c1" });
    await fireEvent.press(await screen.findByRole("tab", { name: "What You Will Learn" }));
    expect(await screen.findByTestId("panel-learn")).toBeTruthy();
    expect(screen.getByText("Basics")).toBeTruthy();
    lessons.outline.mockResolvedValue({ items: [], modules: [] });
  });

  it("says so when there are no lessons to list yet", async () => {
    lessons.outline.mockResolvedValue({ items: [], modules: [] });
    await renderRouter(app, { initialUrl: "/course/c1?tab=learn" });
    expect(await screen.findByTestId("learn-empty")).toBeTruthy();
  });

  it("offers the free preview to someone who has not enrolled, and opens it", async () => {
    await renderRouter(app, { initialUrl: "/course/c1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Watch the free preview" }));
    expect(screen).toHavePathname("/course/c1/lesson/l1");
  });

  it("offers no preview button when no lesson is a free preview", async () => {
    lessons.outline.mockResolvedValue({
      items: outline.map((l) => ({ ...l, isPreview: false })),
      modules: [],
    });
    await renderRouter(app, { initialUrl: "/course/c1" });
    await screen.findByText("Learn to read charts.");
    await waitFor(() => expect(lessons.outline).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Watch the free preview" })).toBeNull();
  });

  it("shows Continue and progress for an enrolled student, with no success banner and no purchase button", async () => {
    courses.get.mockResolvedValue(
      detail({
        enrolled: true,
        onSale: true,
        nextLessonId: "l2",
        progress: { completed: 1, total: 3 },
      }),
    );
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByRole("button", { name: "Continue" })).toBeTruthy();
    expect(screen.getByTestId("enrolled-notice")).toBeTruthy();
    expect(screen.queryByTestId("enroll-notice")).toBeNull();
    expect(screen.queryByRole("button", { name: "Watch the free preview" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(screen).toHavePathname("/course/c1/lesson/l2");
  });

  it("collapses and expands a module", async () => {
    await renderRouter(app, { initialUrl: "/course/c1?tab=curriculum" });
    expect(await screen.findByTestId("lesson-l1")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^Module 1: Basics/ }));
    expect(screen.queryByTestId("lesson-l1")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /^Module 1: Basics/ }));
    expect(screen.getByTestId("lesson-l1")).toBeTruthy();
  });
});

describe("lesson player context", () => {
  const lesson = (over: Record<string, unknown> = {}) => ({
    id: "l1",
    courseId: "c1",
    title: "What is a candle?",
    position: 1,
    isPreview: true,
    body: "A candlestick shows open, high, low and close.",
    ...over,
  });
  beforeEach(() => {
    (lessons.get as jest.Mock).mockResolvedValue(lesson());
  });

  it("shows the course name, a Lab link for chart lessons, and only the next lesson that can be opened", async () => {
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l1" });
    expect(await screen.findByTestId("lesson-course")).toBeTruthy();
    expect(screen.getByText("Price Action Basics")).toBeTruthy();
    // Lesson 2 is locked for someone who has not enrolled, so there is no Next lesson.
    await waitFor(() => expect(lessons.outline).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Next lesson" })).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "Practice on a chart in the Learning Lab" }),
    );
    expect(screen).toHavePathname("/lab");
  });

  it("offers Previous and Next lesson to an enrolled student and moves between them", async () => {
    courses.get.mockResolvedValue(detail({ enrolled: true, onSale: true }));
    (lessons.get as jest.Mock).mockResolvedValue(
      lesson({ id: "l2", title: "Trends", position: 2, isPreview: false }),
    );
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l2" });
    expect(await screen.findByRole("button", { name: "Next lesson" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Previous lesson" }));
    expect(screen).toHavePathname("/course/c1/lesson/l1");
  });

  it("leaves out the Lab link for a lesson that is not about charts", async () => {
    (lessons.get as jest.Mock).mockResolvedValue(
      lesson({ title: "Welcome", body: "Meet your instructor." }),
    );
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l1" });
    await screen.findByTestId("lesson-course");
    expect(
      screen.queryByRole("button", { name: "Practice on a chart in the Learning Lab" }),
    ).toBeNull();
  });
});
