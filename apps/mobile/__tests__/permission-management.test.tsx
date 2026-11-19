import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { fetchAccess, staffCourseApi } from "../src/courses/course-api";
import { permissionApi } from "../src/permissions/permission-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";
import { mockBackHandler } from "../test-utils/back-handler";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
  staffCourseApi: { list: jest.fn(), get: jest.fn() },
  fetchAccess: jest.fn(),
}));
jest.mock("../src/permissions/permission-api", () => ({
  permissionApi: {
    users: jest.fn(),
    detail: jest.fn(),
    save: jest.fn(),
    roles: jest.fn(),
    saveRole: jest.fn(),
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

const api = permissionApi as unknown as Record<keyof typeof permissionApi, jest.Mock>;
const access = fetchAccess as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
mockBackHandler();
const app = "./app";
const hidden = { includeHiddenElements: true };

const ADMIN = {
  roles: ["student", "admin"],
  permissions: ["roles:manage", "instructor_permissions:manage", "audit:read"],
  courseGrants: [],
};
const MANAGER = {
  roles: ["student", "manager"],
  permissions: ["users:read", "course:update"],
  courseGrants: [],
};
const INSTRUCTOR = { roles: ["student", "instructor"], permissions: [], courseGrants: [] };

const row = (over: Record<string, unknown>) => ({
  permission: "course:create",
  label: "Create courses",
  help: "Start new courses.",
  scope: "academy",
  enabled: false,
  source: "none",
  roleDefault: false,
  expiresAt: null,
  reason: null,
  changeable: true,
  lockedReason: null,
  ...over,
});
const summary = (id: string, role: string, name: string) => ({
  id,
  displayName: name,
  email: `${name.split(" ")[0]?.toLowerCase()}@example.com`,
  role,
  status: "active",
});
const detail = (
  role: "instructor" | "manager" | "student",
  over: Record<string, unknown> = {},
) => ({
  user: summary("p1", role, "Ira Instructor"),
  version: 4,
  permissions:
    role === "student"
      ? [
          row({
            permission: "reviews:write",
            label: "Write course reviews",
            scope: "global",
            enabled: true,
            source: "role",
            roleDefault: true,
          }),
        ]
      : role === "manager"
        ? [
            row({
              permission: "users:read",
              label: "View people",
              scope: "global",
              enabled: true,
              source: "role",
              roleDefault: true,
            }),
          ]
        : [
            row({}),
            row({
              permission: "reviews:write",
              label: "Write course reviews",
              scope: "global",
              enabled: true,
              source: "role",
              roleDefault: true,
            }),
          ],
  courseGrants:
    role === "instructor"
      ? [
          {
            id: "g1",
            permission: "course:update",
            courseId: "c1",
            courseTitle: "Price Action Basics",
            source: "manual",
            reason: "Teaches it",
            grantedAt: "2026-11-18T00:00:00.000Z",
            expiresAt: "2027-01-01T00:00:00.000Z",
          },
        ]
      : [],
  availableCourses: [
    { id: "c1", title: "Price Action Basics" },
    { id: "c2", title: "Live Options" },
  ],
  courseAccess:
    role === "student"
      ? [
          {
            entitlementId: "e1",
            courseId: "c1",
            courseTitle: "Price Action Basics",
            source: "admin_grant",
            grantedAt: "2026-11-18T00:00:00.000Z",
          },
        ]
      : [],
  restricted: ["roles:manage", "audit:read", "payments:read_full", "instructor_permissions:manage"],
  ...over,
});
const roles = () => ({
  roles: [
    {
      role: "manager",
      permissions: [
        {
          permission: "users:read",
          label: "View people",
          help: "See accounts.",
          builtIn: true,
          enabled: true,
        },
      ],
    },
    {
      role: "instructor",
      permissions: [
        {
          permission: "course:create",
          label: "Create courses",
          help: "Start courses.",
          builtIn: false,
          enabled: false,
        },
      ],
    },
    {
      role: "student",
      permissions: [
        {
          permission: "reviews:write",
          label: "Write course reviews",
          help: "Rate courses.",
          builtIn: true,
          enabled: true,
        },
      ],
    },
  ],
});

const press = async (name: string) =>
  fireEvent.press(screen.getByRole("button", { name, ...hidden }));
const flip = async (testID: string, value: boolean) =>
  await fireEvent(screen.getByTestId(testID, hidden), "valueChange", value);

beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  access.mockResolvedValue(ADMIN);
  (staffCourseApi.list as jest.Mock).mockResolvedValue({ items: [], nextCursor: null });
  api.users.mockResolvedValue({
    items: [
      summary("p1", "instructor", "Ira Instructor"),
      summary("p2", "instructor", "Gus Lecturer"),
    ],
    nextCursor: null,
  });
  api.detail.mockResolvedValue(detail("instructor"));
  api.save.mockResolvedValue(detail("instructor", { version: 5 }));
  api.roles.mockResolvedValue(roles());
  api.saveRole.mockResolvedValue(roles());
});

describe("the directory", () => {
  it("lists people by role, searches, and opens one", async () => {
    await renderRouter(app, { initialUrl: "/profile/permissions" });
    expect(await screen.findByText("Ira Instructor", hidden)).toBeTruthy();
    expect(screen.getByText("Gus Lecturer", hidden)).toBeTruthy();
    expect(api.users).toHaveBeenCalledWith("instructor", "", null);

    await fireEvent.changeText(screen.getByLabelText("Search instructors", hidden), "gus");
    await act(async () => void jest.advanceTimersByTime(400));
    await waitFor(() => expect(api.users).toHaveBeenCalledWith("instructor", "gus", null));

    await fireEvent.press(await screen.findByTestId("person-p1", hidden));
    expect(await screen.findByTestId("person-name", hidden)).toBeTruthy();
    expect(screen).toHavePathname("/profile/permissions/p1");
  });

  it("switches between Managers and Students and shows an empty search kindly", async () => {
    await renderRouter(app, { initialUrl: "/profile/permissions" });
    await screen.findByText("Ira Instructor", hidden);
    api.users.mockResolvedValue({ items: [], nextCursor: null });
    await fireEvent.press(screen.getByText("Students", hidden));
    await waitFor(() => expect(api.users).toHaveBeenCalledWith("student", "", null));
    expect(await screen.findByText("No students yet", hidden)).toBeTruthy();
  });

  it("shows an error with a way to retry", async () => {
    api.users.mockRejectedValueOnce(appError("server"));
    await renderRouter(app, { initialUrl: "/profile/permissions" });
    expect(await screen.findByRole("button", { name: /retry|try again/i, ...hidden })).toBeTruthy();
  });
});

describe("who can open it", () => {
  it.each([
    ["a Manager", MANAGER, "/profile/permissions"],
    ["a Manager", MANAGER, "/profile/permissions/p1"],
    ["an Instructor", INSTRUCTOR, "/profile/permissions"],
    ["an Instructor", INSTRUCTOR, "/profile/permissions/p1"],
  ])("refuses %s at %s and makes no permission request", async (_who, who, url) => {
    access.mockResolvedValue(who);
    await renderRouter(app, { initialUrl: url });
    expect(await screen.findByText("Only Admins can manage permissions.", hidden)).toBeTruthy();
    expect(api.users).not.toHaveBeenCalled();
    expect(api.detail).not.toHaveBeenCalled();
    expect(api.roles).not.toHaveBeenCalled();
  });
});

describe("one Instructor", () => {
  const open = async () => {
    await renderRouter(app, { initialUrl: "/profile/permissions/p1" });
    await screen.findByTestId("person-name", hidden);
  };

  it("shows where each permission comes from, the courses, and the end date", async () => {
    await open();
    expect(screen.getByTestId("perm-reviews:write-source", hidden).props.children).toBe(
      "From role",
    );
    expect(screen.getByTestId("perm-course:create-source", hidden).props.children).toBe(
      "Not given",
    );
    expect(screen.getByTestId("course-perm-c1-course:update-source", hidden).props.children).toBe(
      "Individual grant",
    );
    expect(screen.getByTestId("course-perm-c1-course:update-ends", hidden)).toBeTruthy();
    expect(screen.getByText("Price Action Basics", hidden)).toBeTruthy();
    // Nothing to save until something moves.
    expect(screen.getByTestId("no-changes", hidden)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Save changes", ...hidden }).props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it("saves a course permission and an academy permission together, with reason and version", async () => {
    await open();
    await flip("course-perm-c1-lesson:upload-switch", true);
    await flip("perm-course:create-switch", true);
    await fireEvent.press(screen.getByText("30 days", hidden));
    await press("Save 2 changes");
    await fireEvent.changeText(
      await screen.findByLabelText("Reason", hidden),
      "Guest lecturer this term",
    );
    await press("Save");
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    const [id, body] = api.save.mock.calls[0] as [
      string,
      { reason: string; expectedVersion: number; changes: Array<Record<string, unknown>> },
    ];
    expect(id).toBe("p1");
    expect(body.reason).toBe("Guest lecturer this term");
    expect(body.expectedVersion).toBe(4);
    expect(body.changes).toHaveLength(2);
    const course = body.changes.find((c) => c.permission === "lesson:upload");
    expect(course).toMatchObject({ courseId: "c1", enabled: true });
    expect(typeof course?.expiresAt).toBe("string");
    expect(body.changes.find((c) => c.permission === "course:create")).toMatchObject({
      enabled: true,
    });
    expect(await screen.findByTestId("person-notice", hidden)).toBeTruthy();
  });

  it("removes a course permission without an end date", async () => {
    await open();
    await flip("course-perm-c1-course:update-switch", false);
    await press("Save 1 change");
    await fireEvent.changeText(
      await screen.findByLabelText("Reason", hidden),
      "Course handed over",
    );
    await press("Save");
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    const body = (
      api.save.mock.calls[0] as [string, { changes: Array<Record<string, unknown>> }]
    )[1];
    expect(body.changes).toEqual([{ permission: "course:update", courseId: "c1", enabled: false }]);
  });

  it("adds another course, only for that course", async () => {
    await open();
    await press("Add a course");
    await fireEvent.press(await screen.findByRole("button", { name: "Live Options", ...hidden }));
    await flip("course-perm-c2-course:publish-switch", true);
    await press("Save 1 change");
    await fireEvent.changeText(await screen.findByLabelText("Reason", hidden), "Runs this course");
    await press("Save");
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    const body = (
      api.save.mock.calls[0] as [string, { changes: Array<Record<string, unknown>> }]
    )[1];
    expect(body.changes).toEqual([{ permission: "course:publish", courseId: "c2", enabled: true }]);
  });

  it("keeps the typed reason and says so when the server refuses, then recovers", async () => {
    api.save.mockRejectedValueOnce(appError("conflict"));
    await open();
    await flip("perm-course:create-switch", true);
    await press("Save 1 change");
    await fireEvent.changeText(await screen.findByLabelText("Reason", hidden), "Guest lecturer");
    await press("Save");
    expect(await screen.findByTestId("reason-error", hidden)).toBeTruthy();
    expect(screen.getByLabelText("Reason", hidden).props.value).toBe("Guest lecturer");
    await press("Save");
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId("person-notice", hidden)).toBeTruthy();
  });

  it("disables a switch the role has turned off and explains why", async () => {
    api.detail.mockResolvedValue(
      detail("instructor", {
        permissions: [
          row({
            permission: "reviews:write",
            label: "Write course reviews",
            scope: "global",
            changeable: false,
            lockedReason: "Turned off for the whole role. Change it under Role defaults.",
          }),
        ],
      }),
    );
    await open();
    expect(screen.getByTestId("perm-reviews:write-locked", hidden)).toBeTruthy();
    expect(screen.getByTestId("perm-reviews:write-switch", hidden).props.disabled).toBe(true);
  });
});

describe("a Manager and a Student", () => {
  it("shows a Manager's role permission and sends a switch-off with its end date", async () => {
    api.detail.mockResolvedValue(detail("manager"));
    await renderRouter(app, { initialUrl: "/profile/permissions/p1" });
    await screen.findByTestId("person-name", hidden);
    expect(screen.queryByText("Courses this person works on", hidden)).toBeNull();
    await flip("perm-users:read-switch", false);
    await fireEvent.press(screen.getByText("7 days", hidden));
    await press("Save 1 change");
    await fireEvent.changeText(await screen.findByLabelText("Reason", hidden), "Away for a week");
    await press("Save");
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    const body = (
      api.save.mock.calls[0] as [string, { changes: Array<Record<string, unknown>> }]
    )[1];
    expect(body.changes[0]).toMatchObject({ permission: "users:read", enabled: false });
    expect(typeof body.changes[0]?.expiresAt).toBe("string");
  });

  it("shows a Student's course access as read-only and never as a switch", async () => {
    api.detail.mockResolvedValue(
      detail("student", { user: summary("p1", "student", "Sam Student") }),
    );
    await renderRouter(app, { initialUrl: "/profile/permissions/p1" });
    await screen.findByTestId("person-name", hidden);
    expect(screen.getByTestId("access-note", hidden).props.children).toMatch(
      /never give or remove course access/,
    );
    expect(screen.getByTestId("access-c1", hidden)).toBeTruthy();
    expect(screen.queryByText("Courses this person works on", hidden)).toBeNull();
    expect(screen.queryByTestId("course-perm-c1-course:update-switch", hidden)).toBeNull();
    await flip("perm-reviews:write-switch", false);
    await press("Save 1 change");
    await fireEvent.changeText(await screen.findByLabelText("Reason", hidden), "Abusive reviews");
    await press("Save");
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    const body = (api.save.mock.calls[0] as [string, { changes: unknown[] }])[1];
    expect(body.changes).toEqual([{ permission: "reviews:write", enabled: false }]);
  });

  it("shows a plain message when the account cannot be managed", async () => {
    api.detail.mockRejectedValue(appError("forbidden"));
    await renderRouter(app, { initialUrl: "/profile/permissions/p1" });
    expect(await screen.findByText("Not available", hidden)).toBeTruthy();
  });
});

describe("role defaults", () => {
  it("changes what a whole role gets, with a reason", async () => {
    await renderRouter(app, { initialUrl: "/profile/permissions" });
    await screen.findByText("Ira Instructor", hidden);
    await fireEvent.press(screen.getByText("Roles", hidden));
    expect(await screen.findByTestId("role-defaults", hidden)).toBeTruthy();
    expect(screen.getByText(/Course permissions are never a role default/, hidden)).toBeTruthy();
    await flip("roleperm-instructor-course:create-switch", true);
    await press("Save Instructor defaults");
    await fireEvent.changeText(
      await screen.findByLabelText("Reason", hidden),
      "All instructors may author",
    );
    await press("Save");
    await waitFor(() => expect(api.saveRole).toHaveBeenCalled());
    expect(api.saveRole).toHaveBeenCalledWith("instructor", {
      reason: "All instructors may author",
      changes: [{ permission: "course:create", enabled: true }],
    });
    expect(await screen.findByTestId("roles-notice", hidden)).toBeTruthy();
  });
});
