import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import * as SecureStore from "expo-secure-store";
import { AppError } from "../src/api/errors";
import { courseApi, fetchAccess } from "../src/courses/course-api";
import {
  durationText,
  fromLocalParts,
  liveApi,
  localParts,
  staffLiveApi,
  whenText,
} from "../src/live/live-api";
import { liveOpener } from "../src/live/use-join";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";
import { mockBackHandler } from "../test-utils/back-handler";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
  fetchAccess: jest.fn(),
}));
jest.mock("../src/lessons/lesson-api", () => ({
  lessonApi: { outline: jest.fn(async () => ({ items: [], modules: [] })), get: jest.fn() },
  staffLessonApi: {},
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

const coded = (kind: "conflict" | "forbidden", code: string | null, message = "Refused") =>
  new AppError(kind, message, 409, null, [], null, code);
const courses = courseApi as unknown as { get: jest.Mock };
const access = fetchAccess as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
mockBackHandler();
const app = "./app";
const hidden = { includeHiddenElements: true };
const MIN = 60_000;
const at = (m: number) => new Date(Date.now() + m * MIN).toISOString();

const session = (over: Record<string, unknown> = {}) => {
  const startsAt = (over.startsAt as string | undefined) ?? at(120);
  return {
    id: "s1",
    courseId: "c1",
    courseTitle: "Price Action",
    title: "Opening bell",
    description: "Bring a chart",
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 60 * MIN).toISOString(),
    durationMinutes: 60,
    state: "upcoming",
    joinOpensAt: new Date(Date.parse(startsAt) - 15 * MIN).toISOString(),
    cancelReason: null,
    ...over,
  };
};
const staffSession = (over: Record<string, unknown> = {}) => ({
  ...session(over),
  joinUrl: "https://meet.example.com/a",
  provider: "manual",
  version: 3,
  joinedCount: 0,
  createdAt: "2026-11-19T00:00:00.000Z",
  cancelledAt: null,
  ...over,
});
const course = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  title: "Price Action",
  description: "d",
  level: "beginner",
  priceCents: 4900,
  currency: "USD",
  coverTone: "blue",
  publishedAt: "2026-11-17T00:00:00.000Z",
  lessonCount: 0,
  previewCount: 0,
  enrolled: true,
  progress: { completed: 0, total: 0 },
  ...over,
});

let announce: jest.SpyInstance;
let open: jest.SpyInstance;
let forCourse: jest.SpyInstance;
let mine: jest.SpyInstance;
let join: jest.SpyInstance;
let staff: Record<"list" | "create" | "update" | "cancel", jest.SpyInstance>;
beforeEach(async () => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  open = jest.spyOn(liveOpener, "open").mockResolvedValue({} as never);
  forCourse = jest.spyOn(liveApi, "forCourse").mockResolvedValue([]);
  mine = jest.spyOn(liveApi, "mine").mockResolvedValue([]);
  join = jest.spyOn(liveApi, "join");
  staff = {
    list: jest.spyOn(staffLiveApi, "list").mockResolvedValue([]),
    create: jest.spyOn(staffLiveApi, "create"),
    update: jest.spyOn(staffLiveApi, "update"),
    cancel: jest.spyOn(staffLiveApi, "cancel"),
  };
  courses.get.mockResolvedValue(course());
  access.mockResolvedValue({
    roles: ["student", "manager"],
    permissions: ["live:schedule", "course:update"],
    courseGrants: [],
  });
});

describe("time helpers", () => {
  it("reads local dates and times, refusing ones that do not exist", () => {
    const d = fromLocalParts("2026-12-01", "18:30");
    expect(d && [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual(
      [2026, 11, 1, 18, 30],
    );
    expect(fromLocalParts("2026-02-30", "10:00")).toBeNull();
    expect(fromLocalParts("2026-12-01", "24:00")).toBeNull();
    expect(fromLocalParts("2026-12-01", "10:60")).toBeNull();
    expect(fromLocalParts("12/01/2026", "10:00")).toBeNull();
    expect(fromLocalParts("2026-12-01", "6pm")).toBeNull();
    const iso = (d as Date).toISOString();
    expect(localParts(iso)).toEqual({ date: "2026-12-01", time: "18:30" });
  });

  it("says lengths in words", () => {
    expect(durationText(60)).toBe("1 hour");
    expect(durationText(90)).toBe("1 hour 30 minutes");
    expect(durationText(45)).toBe("45 minutes");
    expect(durationText(121)).toBe("2 hours 1 minute");
  });
});

describe("students", () => {
  it("lists a course's classes for owners, with state, reason and time zone note", async () => {
    forCourse.mockResolvedValue([
      session(),
      session({
        id: "s2",
        title: "Risk clinic",
        state: "cancelled",
        cancelReason: "Instructor ill",
      }),
      session({ id: "s3", title: "Recap", state: "ended", startsAt: at(-300) }),
    ]);
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByText("Live classes")).toBeTruthy();
    expect(screen.getByText("Times are shown in your time zone.")).toBeTruthy();
    expect(
      screen.getByText(new RegExp(`Join opens ${whenText(session().joinOpensAt)}`)),
    ).toBeTruthy();
    expect(screen.getByText("Reason: Instructor ill")).toBeTruthy();
    expect(screen.getByText("Ended")).toBeTruthy();
    // Nothing can be joined yet.
    expect(screen.queryByRole("button", { name: /^Join / })).toBeNull();
    expect(forCourse).toHaveBeenCalledWith("c1");
  });

  it("does not ask for live classes when the person does not own the course", async () => {
    courses.get.mockResolvedValue(course({ enrolled: false }));
    await renderRouter(app, { initialUrl: "/course/c1" });
    await screen.findByText("Price Action");
    expect(forCourse).not.toHaveBeenCalled();
    expect(screen.queryByText("Live classes")).toBeNull();
  });

  it("joins an open class once per tap and opens the link", async () => {
    forCourse.mockResolvedValue([session({ state: "open", startsAt: at(10) })]);
    let release!: (v: unknown) => void;
    join.mockImplementation(() => new Promise((r) => (release = r)));
    await renderRouter(app, { initialUrl: "/course/c1" });
    const button = await screen.findByRole("button", { name: "Join Opening bell" });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(join).toHaveBeenCalledTimes(1);
    expect(join).toHaveBeenCalledWith("c1", "s1");
    await act(async () => release({ url: "https://meet.example.com/a", endsAt: at(70) }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://meet.example.com/a"));
  });

  it("explains a refused join, announces it and reloads the schedule", async () => {
    forCourse.mockResolvedValue([session({ state: "live", startsAt: at(-5) })]);
    join.mockRejectedValueOnce(coded("conflict", "LIVE_CANCELLED"));
    await renderRouter(app, { initialUrl: "/course/c1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Join Opening bell" }));
    expect(await screen.findByText(/This class was cancelled\./)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("This class was cancelled.");
    await waitFor(() => expect(forCourse.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(open).not.toHaveBeenCalled();
    join.mockRejectedValueOnce(appError("network"));
    await fireEvent.press(screen.getByRole("button", { name: "Join Opening bell" }));
    expect(await screen.findByText(/offline/)).toBeTruthy();
  });

  it("offers a retry when the schedule fails to load", async () => {
    // Not a retried kind, so the error shows at once.
    forCourse.mockRejectedValue(appError("unknown"));
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByText("Live classes could not be loaded.")).toBeTruthy();
    forCourse.mockResolvedValue([session()]);
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Opening bell")).toBeTruthy();
  });

  it("shows the next class on home with its course, and nothing when none is scheduled", async () => {
    access.mockResolvedValue({ roles: ["student"], permissions: [], courseGrants: [] });
    await renderRouter(app, { initialUrl: "/home" });
    await screen.findByTestId("app-header");
    await waitFor(() => expect(mine).toHaveBeenCalled());
    expect(screen.queryByTestId("next-live")).toBeNull();
    await screen.unmount();
    mine.mockResolvedValue([
      session({ id: "s0", state: "cancelled", cancelReason: "Moved" }),
      session({ state: "live", startsAt: at(-5) }),
    ]);
    join.mockResolvedValue({ url: "https://meet.example.com/a", endsAt: at(55) });
    await renderRouter(app, { initialUrl: "/home" });
    expect(await screen.findByTestId("next-live")).toBeTruthy();
    expect(screen.getByText("Live now")).toBeTruthy();
    expect(screen.queryByText("Reason: Moved")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Join Opening bell" }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    await fireEvent.press(screen.getByRole("button", { name: "Open Price Action" }));
    expect(screen).toHavePathname("/course/c1");
  });
});

describe("staff", () => {
  it("refuses people without the permission", async () => {
    access.mockResolvedValue({ roles: ["student"], permissions: [], courseGrants: [] });
    await renderRouter(app, { initialUrl: "/manage/c1/live" });
    expect(await screen.findByText("You do not have access")).toBeTruthy();
    expect(staff.list).not.toHaveBeenCalled();
  });

  it("lets an Instructor with a live grant on this course in", async () => {
    access.mockResolvedValue({
      roles: ["student", "instructor"],
      permissions: [],
      courseGrants: [{ courseId: "c1", permissions: ["live:schedule"] }],
    });
    staff.list.mockResolvedValue([staffSession({ joinedCount: 2 })]);
    await renderRouter(app, { initialUrl: "/manage/c1/live" });
    expect(await screen.findByText(/2 people joined/)).toBeTruthy();
  });

  it("starts a class by opening the meeting room with the link given when scheduling", async () => {
    staff.list.mockResolvedValue([staffSession({ joinUrl: "https://meet.example.com/host-room" })]);
    await renderRouter(app, { initialUrl: "/manage/c1/live" });
    await fireEvent.press(await screen.findByRole("button", { name: "Start Opening bell" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://meet.example.com/host-room"));
    expect(screen.queryByTestId("live-start-error")).toBeNull();
  });

  it("says so, in words, when the meeting link cannot be opened, and offers no Start for finished classes", async () => {
    staff.list.mockResolvedValue([
      staffSession(),
      staffSession({ id: "s2", title: "Old one", state: "ended", startsAt: at(-500) }),
    ]);
    open.mockRejectedValueOnce(new Error("no browser"));
    await renderRouter(app, { initialUrl: "/manage/c1/live" });
    await fireEvent.press(await screen.findByRole("button", { name: "Start Opening bell" }));
    expect(await screen.findByTestId("live-start-error")).toBeTruthy();
    expect(screen.getByText(/could not be opened/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start Old one" })).toBeNull();
  });

  it("separates upcoming from past and cancelled classes, and has an empty state", async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/live" });
    expect(await screen.findByText("No upcoming classes")).toBeTruthy();
    await screen.unmount();
    staff.list.mockResolvedValue([
      staffSession(),
      staffSession({ id: "s2", title: "Old one", state: "ended", startsAt: at(-500) }),
    ]);
    await renderRouter(app, { initialUrl: "/manage/c1/live" });
    expect(await screen.findByText("Past and cancelled")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit Opening bell" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Old one" })).toBeNull();
  });

  it("schedules a class from local date and time, checking fields first", async () => {
    staff.create.mockResolvedValue(staffSession());
    await renderRouter(app, { initialUrl: "/manage/c1/live/new" });
    await fireEvent.press(await screen.findByRole("button", { name: "Schedule class" }));
    expect(await screen.findByText("Use the form 2026-12-31")).toBeTruthy();
    expect(screen.getByText("Paste the meeting link")).toBeTruthy();
    expect(staff.create).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Title"), "Opening bell");
    await fireEvent.changeText(screen.getByLabelText("Date (year-month-day)"), "2027-02-30");
    await fireEvent.changeText(screen.getByLabelText("Start time (24-hour)"), "18:30");
    await fireEvent.changeText(
      screen.getByLabelText("Meeting link (https://)"),
      "https://meet.example.com/a",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Schedule class" }));
    expect(await screen.findByText("That date or time does not exist")).toBeTruthy();
    expect(staff.create).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Date (year-month-day)"), "2027-02-03");
    await fireEvent.press(screen.getByRole("button", { name: "Schedule class" }));
    await waitFor(() => expect(staff.create).toHaveBeenCalledTimes(1));
    expect(staff.create).toHaveBeenCalledWith("c1", {
      title: "Opening bell",
      description: "",
      startsAt: new Date(2027, 1, 3, 18, 30).toISOString(),
      durationMinutes: 60,
      joinUrl: "https://meet.example.com/a",
    });
    expect(announce).toHaveBeenCalledWith("Class scheduled");
  });

  it("puts server field errors on the right fields and keeps what was typed", async () => {
    staff.create.mockRejectedValue(
      appError("validation", {
        fields: [{ field: "startsAt", message: "Choose a start time in the future" }],
      }),
    );
    await renderRouter(app, { initialUrl: "/manage/c1/live/new" });
    await fireEvent.changeText(await screen.findByLabelText("Title"), "Opening bell");
    await fireEvent.changeText(screen.getByLabelText("Date (year-month-day)"), "2020-01-01");
    await fireEvent.changeText(screen.getByLabelText("Start time (24-hour)"), "10:00");
    await fireEvent.changeText(
      screen.getByLabelText("Meeting link (https://)"),
      "https://x.example.com",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Schedule class" }));
    expect(await screen.findByText("Choose a start time in the future")).toBeTruthy();
    expect(screen.getByDisplayValue("Opening bell")).toBeTruthy();
  });

  it("edits with the version and, when someone else saved first, keeps the typing and takes the new version", async () => {
    staff.list.mockResolvedValue([staffSession()]);
    staff.update
      .mockRejectedValueOnce(coded("conflict", null))
      .mockResolvedValueOnce(staffSession({ version: 5 }));
    await renderRouter(app, { initialUrl: "/manage/c1/live/s1" });
    const title = await screen.findByDisplayValue("Opening bell");
    await fireEvent.changeText(title, "Opening bell, part 2");
    staff.list.mockResolvedValue([staffSession({ version: 4 })]);
    await fireEvent.press(screen.getByRole("button", { name: "Save class" }));
    expect(await screen.findByText(/Someone else changed this class/)).toBeTruthy();
    expect(screen.getByDisplayValue("Opening bell, part 2")).toBeTruthy();
    expect(staff.update.mock.calls[0][2]).toMatchObject({
      expectedVersion: 3,
      title: "Opening bell, part 2",
    });
    await fireEvent.press(screen.getByRole("button", { name: "Save class" }));
    await waitFor(() => expect(staff.update).toHaveBeenCalledTimes(2));
    expect(staff.update.mock.calls[1][2]).toMatchObject({ expectedVersion: 4 });
  });

  it("keeps a started class's start time and does not let it be edited", async () => {
    const started = staffSession({ state: "live", startsAt: at(-10) });
    staff.list.mockResolvedValue([started]);
    staff.update.mockResolvedValue(started);
    await renderRouter(app, { initialUrl: "/manage/c1/live/s1" });
    expect(
      await screen.findByText("This class has started, so its start time cannot change."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Start time (24-hour)").props.editable).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Save class" }));
    await waitFor(() => expect(staff.update).toHaveBeenCalled());
    expect(staff.update.mock.calls[0][2]).toMatchObject({ startsAt: started.startsAt });
  });

  it("says when a class can no longer change", async () => {
    staff.list.mockResolvedValue([staffSession({ state: "ended" })]);
    await renderRouter(app, { initialUrl: "/manage/c1/live/s1" });
    expect(await screen.findByText("This class can no longer change")).toBeTruthy();
    await screen.unmount();
    staff.list.mockResolvedValue([]);
    await renderRouter(app, { initialUrl: "/manage/c1/live/s9" });
    expect(await screen.findByText("Class not found")).toBeTruthy();
  });

  it("cancels with a reason after checking its length, then announces it", async () => {
    staff.list.mockResolvedValue([staffSession()]);
    staff.cancel.mockResolvedValue(
      staffSession({ state: "cancelled", cancelReason: "Instructor ill" }),
    );
    await renderRouter(app, { initialUrl: "/manage/c1/live" });
    await fireEvent.press(await screen.findByRole("button", { name: "Cancel Opening bell" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cancel class", ...hidden }));
    expect(await screen.findByText("Write 3 to 300 characters", hidden)).toBeTruthy();
    expect(staff.cancel).not.toHaveBeenCalled();
    await fireEvent.changeText(
      screen.getByLabelText("Reason students will see", hidden),
      "Instructor ill",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Cancel class", ...hidden }));
    await waitFor(() => expect(staff.cancel).toHaveBeenCalledWith("c1", "s1", 3, "Instructor ill"));
    expect(
      await screen.findByText(/Class cancelled\. Students will see the reason\./),
    ).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Class cancelled. Students will see the reason.");
  });

  it("explains a cancel that lost a race and reloads the list", async () => {
    staff.list.mockResolvedValue([staffSession()]);
    staff.cancel.mockRejectedValue(coded("conflict", "LIVE_ENDED"));
    await renderRouter(app, { initialUrl: "/manage/c1/live" });
    await fireEvent.press(await screen.findByRole("button", { name: "Cancel Opening bell" }));
    await fireEvent.changeText(
      screen.getByLabelText("Reason students will see", hidden),
      "Too late",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Cancel class", ...hidden }));
    expect(await screen.findByText(/This class has already ended/, hidden)).toBeTruthy();
    await waitFor(() => expect(staff.list.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});
