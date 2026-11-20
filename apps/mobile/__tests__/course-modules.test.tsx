import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import * as SecureStore from "expo-secure-store";
import { courseApi, fetchAccess } from "../src/courses/course-api";
import { lessonApi, staffLessonApi } from "../src/lessons/lesson-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";
import { mockBackHandler } from "../test-utils/back-handler";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
  staffCourseApi: { list: jest.fn(), get: jest.fn(), update: jest.fn() },
  fetchAccess: jest.fn(),
}));
jest.mock("../src/lessons/lesson-api", () => ({
  lessonApi: { outline: jest.fn(), get: jest.fn() },
  staffLessonApi: {
    list: jest.fn(),
    reorder: jest.fn(),
    addModule: jest.fn(),
    renameModule: jest.fn(),
    removeModule: jest.fn(),
    reorderModules: jest.fn(),
    moveToModule: jest.fn(),
  },
}));
jest.mock("../src/progress/progress-api", () => ({
  progressApi: { read: jest.fn(), mark: jest.fn(), unmark: jest.fn() },
}));
jest.mock("../src/reviews/review-api", () => ({
  reviewsApi: {
    list: jest.fn(async () => ({ items: [], nextCursor: null })),
    mine: jest.fn(async () => ({ review: null, moderation: null })),
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

const courses = courseApi as unknown as { get: jest.Mock };
const outlineApi = lessonApi as unknown as { outline: jest.Mock };
const api = staffLessonApi as unknown as Record<
  | "list"
  | "reorder"
  | "addModule"
  | "renameModule"
  | "removeModule"
  | "reorderModules"
  | "moveToModule",
  jest.Mock
>;
const access = fetchAccess as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
mockBackHandler();
const app = "./app";
const hidden = { includeHiddenElements: true };
const MANAGER = {
  roles: ["student", "manager"],
  permissions: ["lesson:upload", "course:update"],
  courseGrants: [],
};

const mod = (n: number, title: string) => ({ id: `m${n}`, title, position: n, version: 1 });
const lesson = (n: number, moduleId: string | null) => ({
  id: `l${n}`,
  courseId: "c1",
  moduleId,
  title: `Lesson ${n}`,
  body: "Text",
  position: n,
  isPreview: false,
  version: 1,
  createdAt: "2026-11-17T00:00:00.000Z",
  updatedAt: "2026-11-17T00:00:00.000Z",
});
// Reading order: no module, then module 1, then module 2.
const staffList = {
  items: [lesson(1, null), lesson(2, "m1"), lesson(3, "m1"), lesson(4, "m2")],
  modules: [mod(1, "Basics"), mod(2, "Advanced")],
};
const press = (name: string) =>
  fireEvent.press(screen.getAllByRole("button", { name, ...hidden }).at(-1)!);
const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label, hidden), text);

let announce: jest.SpyInstance;
beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  access.mockResolvedValue(MANAGER);
  api.list.mockResolvedValue(staffList);
  for (const k of [
    "addModule",
    "renameModule",
    "removeModule",
    "reorderModules",
    "moveToModule",
    "reorder",
  ] as const) {
    api[k].mockResolvedValue(staffList);
  }
});

describe("students see modules on the course page", () => {
  it("shows a header for each module above its lessons", async () => {
    courses.get.mockResolvedValue({
      id: "c1",
      title: "Price Action",
      description: "d",
      level: "beginner",
      priceCents: 0,
      currency: "USD",
      coverTone: "blue",
      publishedAt: "2026-11-17T00:00:00.000Z",
      lessonCount: 3,
      previewCount: 0,
    });
    outlineApi.outline.mockResolvedValue({
      items: [
        { id: "l1", title: "Welcome", position: 1, isPreview: true, moduleId: null },
        { id: "l2", title: "Candles", position: 2, isPreview: false, moduleId: "m1" },
        { id: "l3", title: "Trends", position: 3, isPreview: false, moduleId: "m2" },
      ],
      modules: [
        { id: "m1", title: "Basics", position: 1 },
        { id: "m2", title: "Advanced", position: 2 },
      ],
    });
    await renderRouter(app, { initialUrl: "/course/c1?tab=curriculum" });
    expect(await screen.findByText("Module 1: Basics")).toBeTruthy();
    expect(screen.getByText("Module 2: Advanced")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /^Module 1: Basics/ }).props.accessibilityState.expanded,
    ).toBe(true);
    expect(screen.getByLabelText("Lesson 1: Welcome, free preview")).toBeTruthy();
  });
});

describe("staff manage modules", () => {
  it("lists modules and groups lessons under them, moving lessons only within a module", async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    // Once in the module list and once as the heading of its lessons.
    expect((await screen.findAllByText("Module 1: Basics", hidden)).length).toBe(2);
    expect(screen.getByTestId("group-none")).toBeTruthy();
    expect(screen.getByTestId("group-m1")).toBeTruthy();
    // Lesson 2 is first in module 1: it cannot move up into the lessons without a module.
    expect(
      screen.getByRole("button", { name: "Move Lesson 2 up" }).props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Move Lesson 3 down" }).props.accessibilityState.disabled,
    ).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Move Lesson 2 down" }));
    await waitFor(() => expect(api.reorder).toHaveBeenCalledWith("c1", ["l1", "l3", "l2", "l4"]));
  });

  it("adds a module, requiring a title, and announces it", async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await fireEvent.press(await screen.findByRole("button", { name: "Add module" }));
    await press("Add module");
    expect(await screen.findByText("Enter a name", hidden)).toBeTruthy();
    expect(api.addModule).not.toHaveBeenCalled();
    await type("Module title", "  Risk management ");
    await press("Add module");
    await waitFor(() => expect(api.addModule).toHaveBeenCalledWith("c1", "Risk management"));
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Module Risk management added"));
  });

  it("reorders modules and renames with the version it started from", async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await fireEvent.press(await screen.findByRole("button", { name: "Move module Advanced up" }));
    await waitFor(() => expect(api.reorderModules).toHaveBeenCalledWith("c1", ["m2", "m1"]));
    await fireEvent.press(screen.getByRole("button", { name: "Rename module Basics" }));
    await type("Module title", "Foundations");
    await press("Save title");
    await waitFor(() =>
      expect(api.renameModule).toHaveBeenCalledWith("c1", "m1", 1, "Foundations"),
    );
  });

  it("explains a rename conflict and refreshes", async () => {
    api.renameModule.mockRejectedValueOnce(appError("conflict"));
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await fireEvent.press(await screen.findByRole("button", { name: "Rename module Basics" }));
    await type("Module title", "Foundations");
    await press("Save title");
    expect(await screen.findByTestId("lessons-error")).toBeTruthy();
    expect(api.list.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("deletes a module after confirming, saying the lessons stay", async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await fireEvent.press(await screen.findByRole("button", { name: "Delete module Advanced" }));
    expect(screen.getByText(/Its lessons stay in the course/, hidden)).toBeTruthy();
    await press("Delete module");
    await waitFor(() => expect(api.removeModule).toHaveBeenCalledWith("c1", "m2"));
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Module Advanced deleted"));
  });

  it("moves a lesson to another module with a labelled radio list", async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await fireEvent.press(
      await screen.findByRole("button", { name: "Change module for Lesson 1, now No module" }),
    );
    const none = screen.getByRole("radio", { name: "No module", ...hidden });
    expect(none.props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByRole("radio", { name: "Module 2: Advanced", ...hidden }));
    await press("Move lesson");
    await waitFor(() => expect(api.moveToModule).toHaveBeenCalledWith("c1", "l1", "m2"));
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith("Lesson 1 moved to Module 2: Advanced"),
    );
  });

  it("shows no module controls on lessons when the course has no modules", async () => {
    api.list.mockResolvedValue({ items: [lesson(1, null)], modules: [] });
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    expect(await screen.findByText(/No modules\. Modules group lessons/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Change module/ })).toBeNull();
    expect(screen.queryByTestId("group-none")).toBeNull();
  });
});
