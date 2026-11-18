import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { courseApi } from "../src/courses/course-api";
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
  progressApi: { read: jest.fn(), mark: jest.fn(), unmark: jest.fn() },
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
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  courses.get.mockResolvedValue(detail());
  lessons.outline.mockResolvedValue({ items: outline });
});

describe("curriculum on the course page", () => {
  it("lists lessons in order with a text mark, not color alone, and names each state for screen readers", async () => {
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByTestId("lesson-l1")).toBeTruthy();
    expect(lessons.outline).toHaveBeenCalledWith("c1");
    expect(screen.getByLabelText("Lesson 1: What is a candle?, free preview")).toBeTruthy();
    expect(screen.getByLabelText("Lesson 2: Support and resistance, locked")).toBeTruthy();
    expect(screen.getAllByText("Free preview")).toHaveLength(1);
    expect(screen.getAllByText("Locked")).toHaveLength(2);
  });

  it("shows a friendly empty state when the course has no lessons", async () => {
    lessons.outline.mockResolvedValue({ items: [] });
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByTestId("lessons-empty")).toBeTruthy();
    expect(screen.getByText("Lessons are coming.")).toBeTruthy();
  });

  it("fails on its own with Retry and leaves the rest of the page usable", async () => {
    lessons.outline
      .mockRejectedValueOnce(appError("unknown"))
      .mockResolvedValue({ items: outline });
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByTestId("state-error")).toBeTruthy();
    expect(screen.getByText("Price Action Basics")).toBeTruthy();
    await press("Retry");
    expect(await screen.findByTestId("lesson-l1")).toBeTruthy();
  });

  it("shows the offline state when the network is down", async () => {
    jest.setTimeout(15000);
    lessons.outline.mockRejectedValue(appError("network"));
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByTestId("state-offline", {}, { timeout: 8000 })).toBeTruthy();
  });
});

describe("opening lessons", () => {
  it("opens a free preview in the reader, and Back returns to the course page", async () => {
    lessons.get.mockResolvedValue({ ...outline[0], body: "A candle shows four prices." });
    await renderRouter(app, { initialUrl: "/course/c1" });
    await fireEvent.press(await screen.findByTestId("lesson-l1"));
    expect(await screen.findByTestId("lesson-body")).toBeTruthy();
    expect(screen).toHavePathname("/course/c1/lesson/l1");
    expect(lessons.get).toHaveBeenCalledWith("c1", "l1");
    expect(screen.getByText("A candle shows four prices.")).toBeTruthy();
    expect(screen.getByText("What is a candle?")).toBeTruthy();
    await press("Back to course");
    expect(screen).toHavePathname("/course/c1");
    expect(await screen.findByTestId("lesson-l1")).toBeTruthy();
  });

  it("explains a locked lesson in a sheet and asks the server for nothing", async () => {
    await renderRouter(app, { initialUrl: "/course/c1" });
    await fireEvent.press(await screen.findByTestId("lesson-l2"));
    expect(await screen.findByText("This lesson is locked")).toBeTruthy();
    expect(screen.getByText(/is part of the full course/)).toBeTruthy();
    expect(lessons.get).not.toHaveBeenCalled();
    expect(screen).toHavePathname("/course/c1");
    // The sheet has its own close icon plus the Close button; both close it.
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(2);
    await fireEvent.press(screen.getAllByRole("button", { name: "Close" })[1]!);
    await waitFor(() => expect(screen.queryByText("This lesson is locked")).toBeNull());
  });

  it("shows 'no longer available' with a way back when the lesson is gone or no longer a preview", async () => {
    for (const kind of ["not_found", "forbidden"] as const) {
      lessons.get.mockRejectedValue(appError(kind));
      const view = await renderRouter(app, { initialUrl: "/course/c1/lesson/l1" });
      expect(await view.findByText("This lesson is no longer available")).toBeTruthy();
      await fireEvent.press(view.getByRole("button", { name: "Back to course" }));
      expect(screen).toHavePathname("/course/c1");
      await view.unmount();
    }
  });

  it("shows an error with Retry when loading the lesson fails", async () => {
    lessons.get
      .mockRejectedValueOnce(appError("unknown"))
      .mockResolvedValue({ ...outline[0], body: "Text after retry" });
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l1" });
    expect(await screen.findByTestId("state-error")).toBeTruthy();
    await press("Retry");
    expect(await screen.findByText("Text after retry")).toBeTruthy();
  });

  it("shows markup as plain text and an empty body gracefully", async () => {
    lessons.get.mockResolvedValue({ ...outline[0], body: "<b>bold</b> <script>x</script>" });
    const view = await renderRouter(app, { initialUrl: "/course/c1/lesson/l1" });
    expect(await view.findByText("<b>bold</b> <script>x</script>")).toBeTruthy();
    await view.unmount();
    lessons.get.mockResolvedValue({ ...outline[0], body: "" });
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l1" });
    expect(await screen.findByText("This lesson has no text yet.")).toBeTruthy();
  });

  it("does not freeze while the lesson is loading", async () => {
    let finish!: () => void;
    lessons.get.mockImplementation(
      () => new Promise((r) => (finish = () => r({ ...outline[0], body: "Done" }))),
    );
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l1" });
    expect(await screen.findByTestId("state-loading")).toBeTruthy();
    await act(async () => finish());
    expect(await screen.findByText("Done")).toBeTruthy();
  });
});
