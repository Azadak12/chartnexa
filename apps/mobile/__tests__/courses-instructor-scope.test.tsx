import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import {
  canCreateCourses,
  canManageCourses,
  canManageInstructors,
  canPublishCourse,
  fetchAccess,
  staffCourseApi,
} from "../src/courses/course-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";
import { mockBackHandler } from "../test-utils/back-handler";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
  staffCourseApi: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    publish: jest.fn(),
    unpublish: jest.fn(),
  },
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

const staff = staffCourseApi as unknown as Record<keyof typeof staffCourseApi, jest.Mock>;
const access = fetchAccess as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
mockBackHandler();
const app = "./app";

const base = { roles: ["student", "instructor"], permissions: [] as string[], courseGrants: [] };
const EDIT_ONLY = { ...base, courseGrants: [{ courseId: "c1", permissions: ["course:update"] }] };
const EDIT_AND_PUBLISH = {
  ...base,
  courseGrants: [{ courseId: "c1", permissions: ["course:update", "course:publish"] }],
};
const CREATOR = { ...base, permissions: ["course:create"], courseGrants: EDIT_ONLY.courseGrants };

const course = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  title: "Price Action Basics",
  description: "Learn to read charts.",
  level: "beginner",
  priceCents: 4950,
  currency: "USD",
  coverTone: "blue",
  status: "draft",
  version: 1,
  publishedAt: null,
  createdAt: "2026-11-17T00:00:00.000Z",
  updatedAt: "2026-11-17T00:00:00.000Z",
  ...over,
});
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
  access.mockResolvedValue(EDIT_ONLY);
  staff.list.mockResolvedValue({ items: [course()], nextCursor: null });
  staff.get.mockResolvedValue(course());
});

describe("access helpers", () => {
  const roleAccess = (roles: string[], permissions: string[]) =>
    ({ roles, permissions, courseGrants: [] }) as never;
  it("reads role permissions and grants", () => {
    expect(canManageCourses(roleAccess(["student", "manager"], ["course:update"]))).toBe(true);
    expect(canManageCourses(roleAccess(["student"], []))).toBe(false);
    expect(canManageCourses(base as never)).toBe(false);
    expect(canManageCourses(EDIT_ONLY as never)).toBe(true);
    expect(canManageCourses(roleAccess(["student", "instructor"], ["course:create"]))).toBe(true);
    expect(canManageCourses(undefined)).toBe(false);
  });
  it("treats an older access response without grants as having none", () => {
    expect(canManageCourses({ roles: ["student"], permissions: [] } as never)).toBe(false);
  });
  it("decides creating, publishing and managing Instructors", () => {
    expect(canCreateCourses(CREATOR as never)).toBe(true);
    expect(canCreateCourses(EDIT_ONLY as never)).toBe(false);
    expect(canPublishCourse(EDIT_ONLY as never, "c1")).toBe(false);
    expect(canPublishCourse(EDIT_AND_PUBLISH as never, "c1")).toBe(true);
    expect(canPublishCourse(EDIT_AND_PUBLISH as never, "c2")).toBe(false);
    expect(canPublishCourse(roleAccess(["student", "manager"], ["course:publish"]), "x")).toBe(
      true,
    );
    expect(
      canManageInstructors(roleAccess(["student", "manager"], ["instructor_permissions:manage"])),
    ).toBe(true);
    expect(canManageInstructors(EDIT_ONLY as never)).toBe(false);
  });
});

describe("Profile entry for Instructors", () => {
  it("shows Manage courses to an Instructor with a grant, not to one without", async () => {
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByRole("button", { name: "Manage courses" })).toBeTruthy();
    await screen.unmount();

    access.mockResolvedValue(base);
    const view = await renderRouter(app, { initialUrl: "/profile" });
    await view.findByText("Ann");
    expect(view.queryByRole("button", { name: "Manage courses" })).toBeNull();
    expect(view.queryByRole("button", { name: "Instructor permissions" })).toBeNull();
  });
});

describe("Instructor course list", () => {
  it("hides New course without the create grant and shows it with the grant", async () => {
    await renderRouter(app, { initialUrl: "/manage" });
    await screen.findByTestId("staff-course-c1");
    expect(screen.queryByRole("button", { name: "New course" })).toBeNull();
    await screen.unmount();

    access.mockResolvedValue(CREATOR);
    await renderRouter(app, { initialUrl: "/manage" });
    expect(await screen.findByRole("button", { name: "New course" })).toBeTruthy();
  });

  it("explains how access is given when there are no courses", async () => {
    staff.list.mockResolvedValue({ items: [], nextCursor: null });
    await renderRouter(app, { initialUrl: "/manage" });
    expect(await screen.findByText(/An Admin or Manager can give you access/)).toBeTruthy();
  });

  it("shows access denied on the new-course route without the create grant", async () => {
    await renderRouter(app, { initialUrl: "/manage/new" });
    expect(await screen.findByText("You do not have access")).toBeTruthy();
    expect(screen.getByText("You need permission to create courses.")).toBeTruthy();
  });
});

describe("Instructor course form", () => {
  it("is editable but shows no publish control with only an edit grant", async () => {
    await renderRouter(app, { initialUrl: "/manage/c1" });
    expect(await screen.findByLabelText("Title")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish course" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });

  it("shows the publish control with a publish grant on that course", async () => {
    access.mockResolvedValue(EDIT_AND_PUBLISH);
    await renderRouter(app, { initialUrl: "/manage/c1" });
    expect(await screen.findByRole("button", { name: "Publish course" })).toBeTruthy();
  });

  it("keeps typed text and offers Back when access was removed during editing", async () => {
    staff.update.mockRejectedValue(appError("forbidden"));
    await renderRouter(app, { initialUrl: "/manage/c1" });
    await screen.findByLabelText("Title");
    await type("Title", "A new title");
    await press("Save changes");
    expect(await screen.findByTestId("form-error")).toBeTruthy();
    expect(screen.getByText(/You no longer have access to this course/)).toBeTruthy();
    expect(screen.getByLabelText("Title").props.value).toBe("A new title");
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    await waitFor(() => expect(access.mock.calls.length).toBeGreaterThan(1));
  });
});
