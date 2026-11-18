import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { fetchAccess, staffCourseApi } from "../src/courses/course-api";
import { staffLessonApi } from "../src/lessons/lesson-api";
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
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    reorder: jest.fn(),
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

const api = staffLessonApi as unknown as Record<keyof typeof staffLessonApi, jest.Mock>;
const courseApiMock = staffCourseApi as unknown as Record<"get" | "list", jest.Mock>;
const access = fetchAccess as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
mockBackHandler();
const app = "./app";

const MANAGER = { roles: ["student", "manager"], permissions: ["lesson:upload", "course:update"] };
const STUDENT = { roles: ["student"], permissions: [] };
const instructorWith = (courseId: string) => ({
  roles: ["student", "instructor"],
  permissions: [],
  courseGrants: [{ courseId, permissions: ["lesson:upload"] }],
});

const lesson = (n: number, over: Record<string, unknown> = {}) => ({
  id: `l${n}`,
  courseId: "c1",
  title: `Lesson ${n}`,
  body: `Text of lesson ${n}`,
  position: n,
  isPreview: n === 1,
  version: 1,
  createdAt: "2026-11-17T00:00:00.000Z",
  updatedAt: "2026-11-17T00:00:00.000Z",
  ...over,
});
const list = (...ls: unknown[]) => ({ items: ls });
const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  access.mockResolvedValue(MANAGER);
  api.list.mockResolvedValue(list(lesson(1), lesson(2), lesson(3)));
});

describe("access", () => {
  it("shows no-access to a Student and never fetches lessons", async () => {
    access.mockResolvedValue(STUDENT);
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    expect(await screen.findByText("You do not have access")).toBeTruthy();
    expect(api.list).not.toHaveBeenCalled();
  });

  it("lets an Instructor with a lesson grant on this course in, but not on another course", async () => {
    access.mockResolvedValue(instructorWith("c1"));
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    expect(await screen.findByTestId("staff-lesson-l1")).toBeTruthy();
    await screen.unmount();

    jest.clearAllMocks();
    access.mockResolvedValue(instructorWith("other"));
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    expect(await screen.findByText("You do not have access")).toBeTruthy();
    expect(api.list).not.toHaveBeenCalled();
  });

  it("shows no-access on the lesson form and sends nothing", async () => {
    access.mockResolvedValue(STUDENT);
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/new" });
    expect(await screen.findByText("You do not have access")).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();
  });

  it("offers Lessons on the course edit screen to people who may author them", async () => {
    courseApiMock.get.mockResolvedValue({
      id: "c1",
      title: "Price Action Basics",
      description: "d",
      level: "beginner",
      priceCents: 0,
      currency: "USD",
      coverTone: "blue",
      status: "draft",
      version: 1,
      publishedAt: null,
      createdAt: "2026-11-17T00:00:00.000Z",
      updatedAt: "2026-11-17T00:00:00.000Z",
    });
    await renderRouter(app, { initialUrl: "/manage/c1" });
    await screen.findByDisplayValue("Price Action Basics");
    await press("Lessons");
    expect(screen).toHavePathname("/manage/c1/lessons");
  });
});

describe("lesson list", () => {
  it("shows lessons in order with the preview mark as text", async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    expect(await screen.findByText("1. Lesson 1")).toBeTruthy();
    expect(screen.getByText("3. Lesson 3")).toBeTruthy();
    expect(screen.getAllByText("Free preview")).toHaveLength(1);
    expect(screen.getAllByText("Locked")).toHaveLength(2);
    expect(api.list).toHaveBeenCalledWith("c1");
  });

  it("shows an empty state, and an error with Retry", async () => {
    api.list.mockResolvedValueOnce(list());
    const first = await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    expect(await first.findByText("No lessons yet")).toBeTruthy();
    await first.unmount();

    api.list.mockRejectedValueOnce(appError("unknown")).mockResolvedValue(list(lesson(1)));
    const second = await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    expect(await second.findByTestId("state-error")).toBeTruthy();
    await fireEvent.press(second.getByRole("button", { name: "Retry" }));
    expect(await second.findByTestId("staff-lesson-l1")).toBeTruthy();
  });

  it("opens the add form and the edit form", async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await screen.findByTestId("staff-lesson-l1");
    await press("Add lesson");
    expect(screen).toHavePathname("/manage/c1/lessons/new");
  });

  it("edit opens that lesson", async () => {
    api.get.mockResolvedValue(lesson(2));
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await screen.findByTestId("staff-lesson-l2");
    await press("Edit Lesson 2");
    expect(screen).toHavePathname("/manage/c1/lessons/l2");
  });
});

describe("reordering with buttons", () => {
  it("disables Move up on the first and Move down on the last lesson", async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await screen.findByTestId("staff-lesson-l1");
    expect(
      screen.getByRole("button", { name: "Move Lesson 1 up" }).props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Move Lesson 3 down" }).props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Move Lesson 2 up" }).props.accessibilityState.disabled,
    ).toBe(false);
  });

  it("sends the full new order and shows the saved result", async () => {
    api.reorder.mockResolvedValue(
      list(lesson(1, { position: 1 }), lesson(3, { position: 2 }), lesson(2, { position: 3 })),
    );
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await screen.findByTestId("staff-lesson-l1");
    await press("Move Lesson 3 up");
    expect(api.reorder).toHaveBeenCalledWith("c1", ["l1", "l3", "l2"]);
    expect(await screen.findByText("2. Lesson 3")).toBeTruthy();
  });

  it("explains a conflict, reloads the list and changes nothing on screen by guesswork", async () => {
    api.reorder.mockRejectedValue(appError("conflict"));
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await screen.findByTestId("staff-lesson-l1");
    api.list.mockResolvedValue(list(lesson(1), lesson(2), lesson(3), lesson(4)));
    await press("Move Lesson 2 down");
    expect(await screen.findByTestId("lessons-error")).toBeTruthy();
    expect(screen.getByText(/changed by someone else/)).toBeTruthy();
    expect(await screen.findByText("4. Lesson 4")).toBeTruthy();
  });
});

describe("deleting", () => {
  it("asks first, names the lesson and does nothing on Cancel", async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await screen.findByTestId("staff-lesson-l2");
    await press("Delete Lesson 2");
    expect(await screen.findByText("Delete this lesson?")).toBeTruthy();
    expect(screen.getByText(/"Lesson 2" and its text will be deleted for good/)).toBeTruthy();
    await press("Cancel");
    expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getByTestId("staff-lesson-l2")).toBeTruthy();
  });

  it("deletes after confirming and refreshes the list", async () => {
    api.remove.mockResolvedValue(undefined);
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await screen.findByTestId("staff-lesson-l2");
    await press("Delete Lesson 2");
    api.list.mockResolvedValue(list(lesson(1), lesson(3, { position: 2 })));
    await press("Delete lesson");
    expect(api.remove).toHaveBeenCalledWith("c1", "l2");
    await waitFor(() => expect(screen.queryByTestId("staff-lesson-l2")).toBeNull());
  });

  it("treats a lesson that is already gone as deleted", async () => {
    api.remove.mockRejectedValue(appError("not_found"));
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await screen.findByTestId("staff-lesson-l2");
    await press("Delete Lesson 2");
    api.list.mockResolvedValue(list(lesson(1), lesson(3, { position: 2 })));
    await press("Delete lesson");
    await waitFor(() => expect(screen.queryByTestId("staff-lesson-l2")).toBeNull());
    expect(screen.queryByTestId("lessons-error")).toBeNull();
  });

  it("shows the reason when deleting is refused", async () => {
    api.remove.mockRejectedValue(appError("forbidden"));
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await screen.findByTestId("staff-lesson-l2");
    await press("Delete Lesson 2");
    await press("Delete lesson");
    expect(await screen.findByText(/no longer have access/)).toBeTruthy();
    expect(screen.getByTestId("staff-lesson-l2")).toBeTruthy();
  });
});

describe("writing lessons for step reading", () => {
  it("tells staff to leave a blank line between paragraphs, on both the add and edit forms", async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/new" });
    await screen.findByLabelText("Title");
    expect(screen.getByTestId("lesson-text-hint")).toBeTruthy();
    expect(screen.getByText(/Leave a blank line between paragraphs/)).toBeTruthy();
    await screen.unmount();
    api.get.mockResolvedValue(lesson(2));
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/l2" });
    await screen.findByDisplayValue("Lesson 2");
    expect(screen.getByTestId("lesson-text-hint")).toBeTruthy();
  });
});

describe("adding a lesson", () => {
  const open = async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/new" });
    await screen.findByLabelText("Title");
  };

  it("validates beside the fields, keeps typed text and sends nothing", async () => {
    await open();
    await type("Lesson text", "Some text");
    await press("Add lesson");
    expect(await screen.findByText("Add a title")).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Lesson text").props.value).toBe("Some text");
    await type("Title", "x".repeat(121));
    await press("Add lesson");
    expect(await screen.findByText("Use at most 120 characters")).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled();
  });

  it("creates with the preview flag and an idempotency key, then returns to the list", async () => {
    api.create.mockResolvedValue(lesson(4));
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await screen.findByTestId("staff-lesson-l1");
    await press("Add lesson");
    await screen.findByLabelText("Title");
    await type("Title", "  New lesson  ");
    await type("Lesson text", "Body");
    await fireEvent(screen.getByLabelText("Free preview"), "valueChange", true);
    await press("Add lesson");
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create).toHaveBeenCalledWith("c1", {
      title: "New lesson",
      body: "Body",
      isPreview: true,
      idempotencyKey: expect.stringMatching(/^lesson-.{12,}$/),
    });
    await waitFor(() => expect(screen).toHavePathname("/manage/c1/lessons"));
  });

  it("reuses the same key when the person retries after a failure, so a lost response cannot duplicate", async () => {
    api.create.mockRejectedValueOnce(appError("network")).mockResolvedValue(lesson(4));
    await open();
    await type("Title", "Retry me");
    await press("Add lesson");
    expect(await screen.findByTestId("form-error")).toBeTruthy();
    expect(screen.getByLabelText("Title").props.value).toBe("Retry me");
    await press("Add lesson");
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(2));
    const keys = api.create.mock.calls.map(
      (c) => (c[1] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys[0]).toBe(keys[1]);
  });

  it("sends one request when the button is pressed twice quickly", async () => {
    let finish!: () => void;
    api.create.mockImplementation(() => new Promise((r) => (finish = () => r(lesson(4)))));
    await open();
    await type("Title", "Once");
    const b = screen.getByRole("button", { name: "Add lesson" });
    await fireEvent.press(b);
    await fireEvent.press(b);
    expect(api.create).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it("explains the 200-lesson limit and maps server field errors", async () => {
    api.create.mockRejectedValueOnce(
      Object.assign(appError("conflict"), { code: "LESSON_LIMIT_REACHED" }),
    );
    await open();
    await type("Title", "One too many");
    await press("Add lesson");
    expect(await screen.findByText(/maximum number of lessons \(200\)/)).toBeTruthy();

    api.create.mockRejectedValueOnce(
      appError("validation", { fields: [{ field: "body", message: "Use plain text only." }] }),
    );
    await press("Add lesson");
    expect(await screen.findByText("Use plain text only.")).toBeTruthy();
  });

  it("keeps typed text and says so when access is removed meanwhile", async () => {
    api.create.mockRejectedValue(appError("forbidden"));
    await open();
    await type("Title", "Keep me");
    await press("Add lesson");
    expect(await screen.findByText(/no longer have access/)).toBeTruthy();
    expect(screen.getByLabelText("Title").props.value).toBe("Keep me");
  });
});

describe("editing a lesson", () => {
  beforeEach(() => api.get.mockResolvedValue(lesson(2, { version: 4 })));
  const open = async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/l2" });
    await screen.findByDisplayValue("Lesson 2");
  };

  it("loads the lesson and saves with the version it started from, then the new one", async () => {
    api.update
      .mockResolvedValueOnce(lesson(2, { title: "Renamed", version: 5 }))
      .mockResolvedValueOnce(lesson(2, { title: "Renamed again", version: 6 }));
    await open();
    expect(screen.getByLabelText("Lesson text").props.value).toBe("Text of lesson 2");
    await type("Title", "Renamed");
    await press("Save changes");
    expect(api.update).toHaveBeenLastCalledWith("c1", "l2", {
      expectedVersion: 4,
      title: "Renamed",
      body: "Text of lesson 2",
      isPreview: false,
    });
    expect(await screen.findByTestId("form-info")).toBeTruthy();
    await type("Title", "Renamed again");
    await press("Save changes");
    await waitFor(() =>
      expect(api.update).toHaveBeenLastCalledWith(
        "c1",
        "l2",
        expect.objectContaining({ expectedVersion: 5 }),
      ),
    );
  });

  it("on a conflict keeps the typed text, explains, and saves against the latest version after Use latest version", async () => {
    api.update.mockRejectedValueOnce(appError("conflict"));
    await open();
    await type("Title", "My edit");
    await press("Save changes");
    expect(await screen.findByTestId("stale-notice")).toBeTruthy();
    expect(screen.getByLabelText("Title").props.value).toBe("My edit");

    api.get.mockResolvedValue(lesson(2, { title: "Their edit", version: 7 }));
    await press("Use latest version");
    expect(await screen.findByTestId("form-info")).toBeTruthy();
    expect(screen.getByLabelText("Title").props.value).toBe("My edit");
    api.update.mockResolvedValue(lesson(2, { title: "My edit", version: 8 }));
    await press("Save changes");
    await waitFor(() =>
      expect(api.update).toHaveBeenLastCalledWith(
        "c1",
        "l2",
        expect.objectContaining({ expectedVersion: 7 }),
      ),
    );
  });

  it("tells the person when the lesson was deleted meanwhile and keeps their text", async () => {
    api.update.mockRejectedValue(appError("not_found"));
    await open();
    await type("Title", "Too late");
    await press("Save changes");
    expect(await screen.findByText(/This lesson was deleted/)).toBeTruthy();
    expect(screen.getByLabelText("Title").props.value).toBe("Too late");
  });

  it("shows a friendly state when the lesson does not exist", async () => {
    api.get.mockRejectedValue(appError("not_found"));
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/gone" });
    expect(await screen.findByText("Lesson not found")).toBeTruthy();
  });

  it("labels the free preview switch and reflects its state", async () => {
    await open();
    const sw = screen.getByLabelText("Free preview");
    expect(sw.props.accessibilityState).toEqual({ checked: false });
    await fireEvent(sw, "valueChange", true);
    expect(screen.getByLabelText("Free preview").props.accessibilityState).toEqual({
      checked: true,
    });
  });
});
