import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { continueApi } from "../src/progress/continue-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
}));
jest.mock("../src/lessons/lesson-api", () => ({
  lessonApi: {
    outline: jest.fn(async () => ({ items: [], modules: [] })),
    get: jest.fn(() => new Promise(() => {})),
  },
  staffLessonApi: {},
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

const secure = SecureStore as unknown as { __reset: () => void };
const app = "./app";
const item = {
  courseId: "c1",
  courseTitle: "Price Action",
  coverTone: "blue",
  thumbnailUrl: null,
  completed: 2,
  total: 5,
  nextLessonId: "l3",
  nextLessonTitle: "Support and resistance",
  lastActivityAt: "2026-11-19T10:00:00.000Z",
};

let get: jest.SpyInstance;
beforeEach(async () => {
  jest.restoreAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  get = jest.spyOn(continueApi, "get").mockResolvedValue(item);
});

describe("continue learning on home", () => {
  it("shows the course, its progress and next lesson, and opens that lesson", async () => {
    await renderRouter(app, { initialUrl: "/home" });
    expect(await screen.findByTestId("continue-learning")).toBeTruthy();
    expect(screen.getByText("Price Action")).toBeTruthy();
    expect(screen.getByText(/Support and resistance/)).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: /^Continue Price Action: Support and resistance/ }),
    );
    expect(screen).toHavePathname("/course/c1/lesson/l3");
  });

  it("shows nothing when there is nothing to resume or the request fails", async () => {
    get.mockResolvedValue(null);
    await renderRouter(app, { initialUrl: "/home" });
    await screen.findByTestId("app-header");
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByTestId("continue-learning")).toBeNull();
    await screen.unmount();
    get.mockRejectedValue(appError("unknown"));
    await renderRouter(app, { initialUrl: "/home" });
    await screen.findByTestId("app-header");
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("continue-learning")).toBeNull();
  });
});
