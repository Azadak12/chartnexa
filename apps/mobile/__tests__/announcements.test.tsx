import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import * as SecureStore from "expo-secure-store";
import { fetchAccess, staffCourseApi } from "../src/courses/course-api";
import { announcementApi, staffAnnouncementApi } from "../src/announcements/announcement-api";
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

const access = fetchAccess as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
mockBackHandler();
const app = "./app";
const hidden = { includeHiddenElements: true };
const MANAGER = {
  roles: ["student", "manager"],
  permissions: ["announcements:publish"],
  courseGrants: [],
};
const STUDENT = { roles: ["student"], permissions: [], courseGrants: [] };
const page = <T,>(items: T[], nextCursor: string | null = null) => ({ items, nextCursor });
const ann = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  title: "Market holiday",
  body: "No live classes on Friday.",
  courseId: null,
  courseTitle: null,
  publishedAt: "2026-11-19T10:00:00.000Z",
  read: false,
  ...over,
});
const staffAnn = (over: Record<string, unknown> = {}) => ({
  ...ann(),
  status: "published",
  withdrawnAt: null,
  withdrawReason: null,
  authorId: "u1",
  readCount: 4,
  ...over,
});

let announce: jest.SpyInstance;
let spy: Record<
  "list" | "unread" | "markRead" | "staffList" | "publish" | "withdraw" | "courses",
  jest.SpyInstance
>;
beforeEach(async () => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  access.mockResolvedValue(MANAGER);
  spy = {
    list: jest.spyOn(announcementApi, "list").mockResolvedValue(page([])),
    unread: jest.spyOn(announcementApi, "unread").mockResolvedValue(0),
    markRead: jest.spyOn(announcementApi, "markRead").mockResolvedValue(),
    staffList: jest.spyOn(staffAnnouncementApi, "list").mockResolvedValue(page([])),
    publish: jest.spyOn(staffAnnouncementApi, "publish"),
    withdraw: jest.spyOn(staffAnnouncementApi, "withdraw"),
    courses: jest
      .spyOn(staffCourseApi, "list")
      .mockResolvedValue(page([{ id: "c1", title: "Price Action" }]) as never),
  };
});

describe("readers", () => {
  it("shows a home shortcut only when something is unread", async () => {
    // Staff start on their dashboard; the student Home is what has the bell.
    access.mockResolvedValue({ roles: ["student"], permissions: [], courseGrants: [] });
    await renderRouter(app, { initialUrl: "/home" });
    await screen.findByTestId("app-header");
    await waitFor(() => expect(spy.unread).toHaveBeenCalled());
    expect(screen.queryByTestId("announcements-banner")).toBeNull();
    await screen.unmount();
    spy.unread.mockResolvedValue(2);
    await renderRouter(app, { initialUrl: "/home" });
    await fireEvent.press(await screen.findByRole("button", { name: "Announcements, 2 new" }));
    expect(screen).toHavePathname("/profile/announcements");
  });

  it("lists announcements, opens one, and marks it read once", async () => {
    spy.list.mockResolvedValue(
      page([
        ann(),
        ann({ id: "a2", title: "Course update", courseTitle: "Price Action", read: true }),
      ]),
    );
    await renderRouter(app, { initialUrl: "/profile/announcements" });
    expect(await screen.findByText("Market holiday")).toBeTruthy();
    expect(screen.getByText(/^Price Action · /)).toBeTruthy();
    expect(screen.getAllByText("New")).toHaveLength(1);
    expect(screen.queryByText("No live classes on Friday.")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Read Market holiday, new" }));
    expect(screen.getByText("No live classes on Friday.")).toBeTruthy();
    expect(spy.markRead).toHaveBeenCalledWith("a1");
    expect(screen.queryByText("New")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Close Market holiday" }));
    await fireEvent.press(screen.getByRole("button", { name: "Read Market holiday" }));
    await fireEvent.press(screen.getByRole("button", { name: "Read Course update" }));
    expect(spy.markRead).toHaveBeenCalledTimes(1);
  });

  it("has empty and error states, and pages", async () => {
    await renderRouter(app, { initialUrl: "/profile/announcements" });
    expect(await screen.findByText("No announcements")).toBeTruthy();
    await screen.unmount();
    spy.list.mockRejectedValueOnce(appError("unknown"));
    spy.list
      .mockResolvedValueOnce(page([ann()], "next"))
      .mockResolvedValueOnce(page([ann({ id: "a9", title: "Older news" })]));
    await renderRouter(app, { initialUrl: "/profile/announcements" });
    await fireEvent.press(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Market holiday")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Older news")).toBeTruthy();
    expect(spy.list).toHaveBeenLastCalledWith("next");
  });
});

describe("staff", () => {
  it("offers posting only to holders of the permission", async () => {
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByRole("button", { name: "Post announcements" })).toBeTruthy();
    await screen.unmount();
    access.mockResolvedValue(STUDENT);
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByRole("button", { name: "Announcements" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Post announcements" })).toBeNull();
    await screen.unmount();
    await renderRouter(app, { initialUrl: "/profile/staff-announcements" });
    expect(
      await screen.findByText("Only Admins and Managers can post announcements."),
    ).toBeTruthy();
    expect(spy.staffList).not.toHaveBeenCalled();
  });

  it("posts to one course with one key across retries", async () => {
    let release!: (v: unknown) => void;
    spy.publish
      .mockRejectedValueOnce(appError("network"))
      .mockImplementationOnce(() => new Promise((r) => (release = r)));
    await renderRouter(app, { initialUrl: "/profile/staff-announcements/new" });
    await fireEvent.press(await screen.findByRole("button", { name: "Post" }));
    expect(await screen.findByText("Write the announcement")).toBeTruthy();
    expect(spy.publish).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Title"), "Course update");
    await fireEvent.changeText(
      screen.getByLabelText("Message (plain text)"),
      "New lesson tomorrow.",
    );
    await fireEvent.press(await screen.findByText("Price Action"));
    expect(screen.getByText("Only people with access to this course will see it.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(await screen.findByTestId("ann-form-error")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    await fireEvent.press(screen.getByRole("button", { name: "Post" }));
    expect(spy.publish).toHaveBeenCalledTimes(2);
    expect(spy.publish.mock.calls[0][0]).toMatchObject({ title: "Course update", courseId: "c1" });
    expect(spy.publish.mock.calls[0][0].idempotencyKey).toBe(
      spy.publish.mock.calls[1][0].idempotencyKey,
    );
    await act(async () => release(staffAnn()));
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Announcement posted"));
  });

  it("withdraws with a reason after checking its length", async () => {
    spy.staffList.mockResolvedValue(page([staffAnn()]));
    spy.withdraw.mockResolvedValue(staffAnn({ status: "withdrawn", withdrawReason: "Mistake" }));
    await renderRouter(app, { initialUrl: "/profile/staff-announcements" });
    expect(await screen.findByText(/Read by 4/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Withdraw Market holiday" }));
    await fireEvent.press(screen.getByRole("button", { name: "Withdraw", ...hidden }));
    expect(await screen.findByText("Write 3 to 300 characters", hidden)).toBeTruthy();
    expect(spy.withdraw).not.toHaveBeenCalled();
    await fireEvent.changeText(
      screen.getByLabelText("Reason (kept in the audit log)", hidden),
      "Mistake",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Withdraw", ...hidden }));
    await waitFor(() => expect(spy.withdraw).toHaveBeenCalledWith("a1", "Mistake"));
    expect(await screen.findByText(/Withdrawn\. Readers no longer see it\./)).toBeTruthy();
  });
});
