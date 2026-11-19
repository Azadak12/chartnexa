import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { courseApi } from "../src/courses/course-api";
import { lessonApi } from "../src/lessons/lesson-api";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { pair } from "../test-utils/auth-mocks";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(), get: jest.fn() },
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

const api = courseApi as unknown as { list: jest.Mock; get: jest.Mock };
const lessons = lessonApi as unknown as { outline: jest.Mock; get: jest.Mock };
const secure = SecureStore as unknown as { __reset: () => void };
const app = "./app";
const course = (n: number) => ({
  id: `c${n}`,
  title: `Course ${n}`,
  summary: "s",
  level: "intermediate",
  priceCents: 4900,
  currency: "USD",
  coverTone: "blue",
  publishedAt: "2026-11-17T00:00:00.000Z",
});
const detail = {
  ...course(7),
  description: "About it.",
  lessonCount: 1,
  previewCount: 1,
  enrolled: false,
  onSale: true,
};

beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  api.list.mockResolvedValue({ items: [course(7)], nextCursor: null });
  api.get.mockResolvedValue(detail);
  lessons.outline.mockResolvedValue({
    items: [{ id: "l1", title: "What is a candle?", position: 1, isPreview: true, moduleId: null }],
    modules: [],
  });
  lessons.get.mockResolvedValue({
    id: "l1",
    courseId: "c7",
    title: "What is a candle?",
    position: 1,
    isPreview: true,
    body: "A candle shows four prices.",
  });
});

describe("back navigation", () => {
  it("Explore, Course, Preview lesson, then Back twice returns to Explore with search and filter intact", async () => {
    await renderRouter(app, { initialUrl: "/explore" });
    await fireEvent.press(await screen.findByTestId("filters-button"));
    await fireEvent.press(await screen.findByRole("radio", { name: "Intermediate" }));
    await fireEvent.press(screen.getByRole("button", { name: "Apply Filters" }));
    await fireEvent.changeText(screen.getByLabelText("Search courses"), "course");
    await waitFor(() =>
      expect(api.list).toHaveBeenCalledWith({ q: "course", level: "intermediate" }),
    );
    await fireEvent.press(await screen.findByTestId("course-c7"));
    expect(screen).toHavePathname("/course/c7");

    await fireEvent.press(await screen.findByRole("button", { name: "Watch Preview" }));
    expect(screen).toHavePathname("/course/c7/lesson/l1");
    expect(await screen.findByText("A candle shows four prices.")).toBeTruthy();

    // The arrow at the top of the lesson goes back to the course, not to Home or Explore.
    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(screen).toHavePathname("/course/c7");
    await fireEvent.press(await screen.findByRole("button", { name: "Go back" }));
    expect(screen).toHavePathname("/explore");
    expect(screen.getByRole("button", { name: "Remove filter Intermediate" })).toBeTruthy();
    expect(screen.getByLabelText("Search courses").props.value).toBe("course");
  });

  it("the Android Back button does the same one step at a time", async () => {
    await renderRouter(app, { initialUrl: "/explore" });
    await fireEvent.press(await screen.findByTestId("course-c7"));
    await fireEvent.press(await screen.findByRole("button", { name: "Watch Preview" }));
    await act(async () => router.back());
    expect(screen).toHavePathname("/course/c7");
    await act(async () => router.back());
    expect(screen).toHavePathname("/explore");
  });

  it("a deep link to a course still has a way back, to Explore", async () => {
    await renderRouter(app, { initialUrl: "/course/c7" });
    await fireEvent.press(await screen.findByRole("button", { name: "Go back" }));
    expect(screen).toHavePathname("/explore");
  });

  it("a deep link to a lesson goes back to its course", async () => {
    await renderRouter(app, { initialUrl: "/course/c7/lesson/l1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Go back" }));
    expect(screen).toHavePathname("/course/c7");
  });
});
