import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo, Animated } from "react-native";
import * as SecureStore from "expo-secure-store";
import { courseApi } from "../src/courses/course-api";
import { lessonApi } from "../src/lessons/lesson-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import * as focus from "../src/ui/focus";
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

const lessons = lessonApi as unknown as { outline: jest.Mock; get: jest.Mock };
const courses = courseApi as unknown as { get: jest.Mock };
const secure = SecureStore as unknown as { __reset: () => void };
const app = "./app";
const url = "/course/c1/lesson/l1";

const lesson = (body: string, over: Record<string, unknown> = {}) => ({
  id: "l1",
  title: "Candles",
  position: 1,
  isPreview: true,
  body,
  ...over,
});
const FOUR = "First idea.\n\nSecond idea.\n\nThird idea.\n\nFourth idea.";
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));
const stepText = () => screen.getByTestId("lesson-step");

beforeEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  courses.get.mockResolvedValue({
    id: "c1",
    title: "Course",
    description: "d",
    level: "beginner",
    priceCents: 0,
    currency: "USD",
    coverTone: "blue",
    publishedAt: "2026-11-17T00:00:00.000Z",
    lessonCount: 1,
    previewCount: 1,
    enrolled: false,
    onSale: true,
  });
  lessons.outline.mockResolvedValue({
    items: [{ id: "l1", title: "Candles", position: 1, isPreview: true }],
  });
  lessons.get.mockResolvedValue(lesson(FOUR));
});

describe("reading in steps", () => {
  it("opens on step 1 with only the first paragraph, Back disabled and Next shown", async () => {
    await renderRouter(app, { initialUrl: url });
    expect(await screen.findByText("First idea.")).toBeTruthy();
    expect(screen.getByText(/Step 1 of 4/)).toBeTruthy();
    expect(screen.queryByText("Second idea.")).toBeNull();
    expect(screen.getByRole("button", { name: "Back" }).props.accessibilityState.disabled).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
    const bar = screen.getByTestId("lesson-progress");
    expect(bar.props.accessibilityLabel).toBe("Step 1 of 4");
    expect(bar.props.accessibilityValue).toEqual({ min: 1, max: 4, now: 1 });
  });

  it("moves forward and back, and swaps Next for Back to course on the last step", async () => {
    await renderRouter(app, { initialUrl: url });
    await screen.findByText("First idea.");
    await press("Next");
    expect(screen.getByText("Second idea.")).toBeTruthy();
    expect(screen.queryByText("First idea.")).toBeNull();
    expect(screen.getByRole("button", { name: "Back" }).props.accessibilityState.disabled).toBe(
      false,
    );
    await press("Next");
    await press("Next");
    expect(screen.getByText("Fourth idea.")).toBeTruthy();
    expect(screen.getByText(/Step 4 of 4/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    await press("Back");
    expect(screen.getByText("Third idea.")).toBeTruthy();
    await press("Next");
    await press("Back to course");
    expect(screen).toHavePathname("/course/c1");
  });

  it("treats a single paragraph as one step with no step controls", async () => {
    lessons.get.mockResolvedValue(lesson("Just one long paragraph.\nWith a line break."));
    await renderRouter(app, { initialUrl: url });
    expect(await screen.findByTestId("lesson-body")).toBeTruthy();
    expect(screen.getByText(/Just one long paragraph/)).toBeTruthy();
    expect(screen.queryByText(/Step 1 of/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show all text" })).toBeNull();
    expect(screen.getByRole("button", { name: "Back to course" })).toBeTruthy();
  });

  it("shows the empty-lesson message with no controls", async () => {
    for (const body of ["", "  \n\n \t\n"]) {
      lessons.get.mockResolvedValue(lesson(body));
      const view = await renderRouter(app, { initialUrl: url });
      expect(await view.findByText("This lesson has no text yet.")).toBeTruthy();
      expect(view.queryByRole("button", { name: "Next" })).toBeNull();
      expect(view.queryByTestId("lesson-progress")).toBeNull();
      await view.unmount();
    }
  });

  it("ignores messy line endings and blank runs, never showing an empty step", async () => {
    lessons.get.mockResolvedValue(lesson("\r\n\r\nA one\r\n\r\n\r\n   \r\n\r\nB two\r\n\r\n"));
    await renderRouter(app, { initialUrl: url });
    expect(await screen.findByText("A one")).toBeTruthy();
    expect(screen.getByText(/Step 1 of 2/)).toBeTruthy();
    await press("Next");
    expect(screen.getByText("B two")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("shows markup as typed text", async () => {
    lessons.get.mockResolvedValue(lesson("<b>bold</b> <script>x</script>\n\nSecond"));
    await renderRouter(app, { initialUrl: url });
    expect(await screen.findByText("<b>bold</b> <script>x</script>")).toBeTruthy();
  });
});

describe("Show all text", () => {
  it("shows the whole lesson as one page and can return to steps", async () => {
    await renderRouter(app, { initialUrl: url });
    await screen.findByText("First idea.");
    await press("Show all text");
    expect(await screen.findByTestId("lesson-body")).toBeTruthy();
    expect(screen.getByText(/First idea\.[\s\S]*Fourth idea\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByText(/Step \d of/)).toBeNull();
    await press("Show in steps");
    expect(await screen.findByText(/Step 1 of 4/)).toBeTruthy();
  });

  it("remembers the mode when another lesson is opened", async () => {
    lessons.get.mockImplementation(async (_c: string, id: string) =>
      lesson(id === "l1" ? FOUR : "Other A\n\nOther B", { id }),
    );
    const view = await renderRouter(app, { initialUrl: url });
    await view.findByText("First idea.");
    await press("Show all text");
    await view.findByTestId("lesson-body");
    await view.unmount();
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l2" });
    expect(await screen.findByTestId("lesson-body")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show in steps" })).toBeTruthy();
  });
});

describe("remembering the step", () => {
  it("reopens the step the person was on after going back to the course", async () => {
    await renderRouter(app, { initialUrl: "/course/c1" });
    await fireEvent.press(await screen.findByTestId("lesson-l1"));
    await screen.findByText("First idea.");
    await press("Next");
    await press("Next");
    expect(screen.getByText(/Step 3 of 4/)).toBeTruthy();
    await act(
      async () => void fireEvent.press(screen.getByRole("button", { name: "Back to course" })),
    );
    expect(screen).toHavePathname("/course/c1");
    await fireEvent.press(await screen.findByTestId("lesson-l1"));
    expect(await screen.findByText("Third idea.")).toBeTruthy();
    expect(screen.getByText(/Step 3 of 4/)).toBeTruthy();
  });

  it("shows the last step when the lesson has become shorter", async () => {
    const view = await renderRouter(app, { initialUrl: url });
    await view.findByText("First idea.");
    await press("Next");
    await press("Next");
    await press("Next");
    await view.unmount();
    lessons.get.mockResolvedValue(lesson("Only A\n\nOnly B"));
    // A fresh query cache so the shorter lesson is fetched again.
    await renderRouter(app, { initialUrl: url });
    expect(await screen.findByText("Only B")).toBeTruthy();
    expect(screen.getByText(/Step 2 of 2/)).toBeTruthy();
  });

  it("forgets the step after sign-out", async () => {
    const view = await renderRouter(app, { initialUrl: url });
    await view.findByText("First idea.");
    await press("Next");
    await view.unmount();
    await act(async () => sessionStore.set("signed-out"));
    sessionStore.set("signed-in");
    await renderRouter(app, { initialUrl: url });
    expect(await screen.findByText("First idea.")).toBeTruthy();
    expect(screen.getByText(/Step 1 of 4/)).toBeTruthy();
  });
});

describe("accessibility", () => {
  it("announces each new step and moves focus to its text, but not on first open", async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    const focusSpy = jest.spyOn(focus, "focusElement").mockImplementation(() => undefined);
    await renderRouter(app, { initialUrl: url });
    await screen.findByText("First idea.");
    expect(announce).not.toHaveBeenCalled();
    expect(focusSpy).not.toHaveBeenCalled();
    await press("Next");
    expect(announce).toHaveBeenLastCalledWith("Step 2 of 4");
    await waitFor(() => expect(focusSpy).toHaveBeenCalledTimes(1));
    await press("Back");
    expect(announce).toHaveBeenLastCalledWith("Step 1 of 4");
    await waitFor(() => expect(focusSpy).toHaveBeenCalledTimes(2));
  });

  it("makes the step text one focusable element and labels every control", async () => {
    await renderRouter(app, { initialUrl: url });
    await screen.findByText("First idea.");
    expect(stepText().props.accessible).toBe(true);
    for (const name of ["Back", "Next", "Show all text", "Back to course"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("does not animate when reduced motion is on, and fades when it is off", async () => {
    const timing = jest.spyOn(Animated, "timing");
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const first = await renderRouter(app, { initialUrl: url });
    await first.findByText("First idea.");
    await press("Next");
    expect(timing).not.toHaveBeenCalled();
    await first.unmount();

    clearScreenMemory();
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    await renderRouter(app, { initialUrl: url });
    await screen.findByText("First idea.");
    await act(async () => undefined);
    await press("Next");
    await waitFor(() => expect(timing).toHaveBeenCalledTimes(1));
    expect(timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ duration: 150 }),
    );
  });
});

describe("states that did not change", () => {
  it("still shows an error with Retry and then the steps", async () => {
    lessons.get.mockRejectedValueOnce(appError("unknown")).mockResolvedValue(lesson(FOUR));
    await renderRouter(app, { initialUrl: url });
    expect(await screen.findByTestId("state-error")).toBeTruthy();
    await press("Retry");
    expect(await screen.findByText("First idea.")).toBeTruthy();
  });

  it("shows no lesson text once access is lost", async () => {
    lessons.get.mockRejectedValue(
      Object.assign(appError("forbidden"), { code: "ENROLLMENT_REQUIRED" }),
    );
    await renderRouter(app, { initialUrl: url });
    expect(await screen.findByText("You no longer have access to this lesson")).toBeTruthy();
    expect(screen.queryByTestId("lesson-step")).toBeNull();
    expect(screen.queryByTestId("lesson-body")).toBeNull();
    expect(screen.queryByText("First idea.")).toBeNull();
  });
});
