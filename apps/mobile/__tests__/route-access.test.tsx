import { renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { fetchAccess, staffCourseApi } from "../src/courses/course-api";
import { invitationApi } from "../src/invitations/invitation-api";
import { sessionManager } from "../src/auth/session-manager";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { sessionStore } from "../src/session/session-store";
import { pair } from "../test-utils/auth-mocks";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
  staffCourseApi: { list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn() },
  fetchAccess: jest.fn(),
}));
jest.mock("../src/auth/account-api", () => ({
  accountApi: {
    me: jest.fn().mockResolvedValue({
      id: "u1",
      email: "s@x.co",
      displayName: "Sam",
      emailVerified: true,
      createdAt: "2026-11-17T00:00:00.000Z",
    }),
    resendVerification: jest.fn(),
  },
}));
jest.mock("../src/auth/mfa-api", () => ({
  mfaApi: { status: jest.fn(async () => ({ required: false, enabled: false })) },
}));

const access = fetchAccess as unknown as jest.Mock;
const app = "./app";
const STUDENT = { roles: ["student"], permissions: [], courseGrants: [] };
const INSTRUCTOR = {
  roles: ["student", "instructor"],
  permissions: ["course:create"],
  courseGrants: [{ courseId: "c1", permissions: ["course:update", "lesson:upload"] }],
};

/** Staff addresses typed or linked to by hand. */
const STAFF_URLS = [
  "/dashboard",
  "/manage",
  "/manage/new",
  "/manage/categories",
  "/manage/c9",
  "/manage/c9/lessons",
  "/manage/c9/lessons/new",
  "/manage/c9/live",
  "/manage/c9/live/new",
  "/manage/c9/students",
  "/manage/c9/students/grant",
  "/manage/c9/assignments",
  "/manage/c9/assignments/new",
  "/profile/audit",
  "/profile/orders",
  "/profile/invitations",
  "/profile/instructors",
  "/profile/permissions",
  "/profile/permissions/p1",
  "/profile/reviews",
  "/profile/staff-announcements",
];
const DENIAL = /not available|do not have access|no access|not allowed|permission/i;

beforeEach(async () => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
});

describe("a Student typing or following a staff address", () => {
  it.each(STAFF_URLS)("gets a refusal at %s and no staff request is made", async (url) => {
    access.mockResolvedValue(STUDENT);
    jest.spyOn(invitationApi, "list");
    jest.spyOn(invitationApi, "instructors");
    await renderRouter(app, { initialUrl: url });
    await waitFor(() => expect(screen.getAllByText(DENIAL).length).toBeGreaterThan(0));
    expect(staffCourseApi.list).not.toHaveBeenCalled();
    expect(staffCourseApi.get).not.toHaveBeenCalled();
    expect(invitationApi.list).not.toHaveBeenCalled();
    expect(invitationApi.instructors).not.toHaveBeenCalled();
  });
});

describe("an Instructor reaching for the Admin and Manager screens", () => {
  it.each([
    "/profile/audit",
    "/profile/orders",
    "/profile/invitations",
    "/profile/instructors",
    "/profile/permissions",
    "/profile/permissions/p1",
    "/profile/staff-announcements",
    "/profile/reviews",
    "/manage/categories",
  ])("is refused at %s", async (url) => {
    access.mockResolvedValue(INSTRUCTOR);
    (staffCourseApi.list as jest.Mock).mockResolvedValue({ items: [], nextCursor: null });
    await renderRouter(app, { initialUrl: url });
    await waitFor(() => expect(screen.getAllByText(DENIAL).length).toBeGreaterThan(0));
  });

  it("cannot open a course they were not given, or its content and live screens", async () => {
    access.mockResolvedValue(INSTRUCTOR);
    for (const url of [
      "/manage/c9/lessons",
      "/manage/c9/live",
      "/manage/c9/lessons/new",
      "/manage/c9/live/new",
    ]) {
      await renderRouter(app, { initialUrl: url });
      await waitFor(() => expect(screen.getAllByText(DENIAL).length).toBeGreaterThan(0));
      await screen.unmount();
    }
  });

  it("does reach the content screen of a course they were given", async () => {
    access.mockResolvedValue(INSTRUCTOR);
    await renderRouter(app, { initialUrl: "/manage/c1/lessons" });
    await waitFor(() => expect(screen.queryAllByText(DENIAL)).toHaveLength(0));
  });
});

describe("a course the server refuses", () => {
  it("is shown as 'no access' to an Instructor opening a course they were not given", async () => {
    access.mockResolvedValue(INSTRUCTOR);
    (staffCourseApi.get as jest.Mock).mockRejectedValue(
      Object.assign(
        new (jest.requireActual("../src/api/errors").AppError)(
          "forbidden",
          "Forbidden",
          403,
          "r1",
          [],
          null,
        ),
        {},
      ),
    );
    await renderRouter(app, { initialUrl: "/manage/c9" });
    expect(await screen.findByText("You do not have access")).toBeTruthy();
    expect(screen.queryByText(/request id|r1/i)).toBeNull();
  });
});

describe("no staff data after switching accounts", () => {
  it("shows a Student nothing from the Admin who used the same phone before", async () => {
    (staffCourseApi.list as jest.Mock).mockResolvedValue({
      items: [
        {
          id: "c1",
          title: "Admin-only visible title",
          level: "beginner",
          priceCents: 0,
          status: "draft",
          coverTone: "blue",
          thumbnailUrl: null,
          updatedAt: "2026-11-01T00:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
    access.mockResolvedValue({
      roles: ["student", "admin"],
      permissions: ["course:create", "course:update"],
      courseGrants: [],
    });
    await renderRouter(app, { initialUrl: "/manage" });
    expect(await screen.findByText("Admin-only visible title")).toBeTruthy();
    await sessionManager.signOut();
    await waitFor(() => expect(screen).toHavePathname("/sign-in"));
    access.mockResolvedValue(STUDENT);
    await sessionManager.signIn(pair());
    await waitFor(() => expect(screen).toHavePathname("/home"));
    expect(screen.queryByText("Admin-only visible title")).toBeNull();
  });
});
