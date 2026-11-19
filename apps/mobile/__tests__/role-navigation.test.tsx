import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { StyleSheet } from "react-native";
import * as SecureStore from "expo-secure-store";
import { fetchAccess, staffCourseApi } from "../src/courses/course-api";
import { invitationApi } from "../src/invitations/invitation-api";
import { roleOf, tabsFor } from "../src/staff/role-tabs";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";

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
const app = "./app";
const STUDENT = { roles: ["student"], permissions: [], courseGrants: [] };
const INSTRUCTOR = {
  roles: ["student", "instructor"],
  permissions: ["course:create"],
  courseGrants: [{ courseId: "c1", permissions: ["course:update", "assignments:manage"] }],
};
const MANAGER = {
  roles: ["student", "manager"],
  permissions: ["instructors:invite", "course:create", "course:update"],
  courseGrants: [],
};
const ADMIN = {
  roles: ["student", "admin"],
  permissions: [
    "instructors:invite",
    "course:create",
    "course:update",
    "audit:read",
    "roles:manage",
  ],
  courseGrants: [],
};
const names = (r: Parameters<typeof tabsFor>[0]) => tabsFor(r).map((t) => t.title);

beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  jest.spyOn(staffCourseApi, "list").mockImplementation(async (q) => ({
    items: (q?.status === "draft"
      ? [{ id: "d1" }]
      : [{ id: "c1" }, { id: "c2" }, { id: "c3" }]) as never,
    nextCursor: null,
  }));
  jest.spyOn(invitationApi, "instructors").mockResolvedValue([
    {
      id: "i1",
      displayName: "Ira",
      email: "i@x.co",
      since: "2026-11-01T00:00:00.000Z",
      courseCount: 2,
    },
  ] as never);
  jest.spyOn(invitationApi, "list").mockResolvedValue({
    items: [{ id: "v1" }, { id: "v2" }] as never,
    nextCursor: "more",
  });
});

describe("tab sets by role", () => {
  it("matches the agreed navigation for each role, and lets the highest role win", () => {
    expect(names("student")).toEqual(["Home", "Explore", "My Learning", "Assignments", "Profile"]);
    expect(names("instructor")).toEqual(["Dashboard", "Courses", "Assignments", "Profile"]);
    expect(names("admin")).toEqual(["Dashboard", "Users", "Courses", "More"]);
    expect(names("manager")).toEqual(["Dashboard", "Invitations", "Profile"]);
    expect(roleOf(ADMIN as never)).toBe("admin");
    expect(roleOf(MANAGER as never)).toBe("manager");
    expect(roleOf(INSTRUCTOR as never)).toBe("instructor");
    expect(roleOf(STUDENT as never)).toBe("student");
    expect(roleOf(undefined)).toBe("student");
  });
});

describe("the tab bar", () => {
  const bar = async (a: unknown, url = "/home") => {
    access.mockResolvedValue(a);
    await renderRouter(app, { initialUrl: url });
  };

  it("shows a student their five tabs and nothing staff-only", async () => {
    await bar(STUDENT);
    for (const n of ["Home", "Explore", "My Learning", "Assignments", "Profile"]) {
      expect(await screen.findByRole("button", { name: n })).toBeTruthy();
    }
    for (const n of ["Dashboard", "Users", "Invitations", "More"]) {
      expect(screen.queryByRole("button", { name: n })).toBeNull();
    }
  });

  it("sends an Instructor to their dashboard, with Dashboard, Courses, Assignments and Profile", async () => {
    await bar(INSTRUCTOR);
    expect(await screen.findByText("Instructor Studio")).toBeTruthy();
    for (const n of ["Dashboard", "Courses", "Assignments", "Profile"]) {
      expect(screen.getByRole("button", { name: n })).toBeTruthy();
    }
    for (const n of ["Home", "Explore", "My Learning", "Users", "More", "Invitations"]) {
      expect(screen.queryByRole("button", { name: n })).toBeNull();
    }
  });

  it("gives an Admin Dashboard, Users, Courses and More", async () => {
    await bar(ADMIN);
    expect(await screen.findByText("Admin Dashboard")).toBeTruthy();
    for (const n of ["Dashboard", "Users", "Courses", "More"]) {
      expect(screen.getByRole("button", { name: n })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "Profile" })).toBeNull();
  });

  it("gives a Manager Dashboard, Invitations and Profile, with no Courses or Users", async () => {
    await bar(MANAGER);
    expect(await screen.findByText("Manager dashboard")).toBeTruthy();
    for (const n of ["Dashboard", "Invitations", "Profile"]) {
      expect(screen.getByRole("button", { name: n })).toBeTruthy();
    }
    for (const n of ["Users", "Courses", "More"]) {
      expect(screen.queryByRole("button", { name: n })).toBeNull();
    }
  });

  it("keeps a deep link to a tab the role does not show, instead of resetting to the dashboard", async () => {
    await bar(ADMIN, "/profile");
    await waitFor(() => expect(access).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Active sessions" })).toBeTruthy();
    expect(screen).toHavePathname("/profile");
  });

  it("opens the invitations screen from the Manager's Invitations tab", async () => {
    await bar(MANAGER);
    await fireEvent.press(await screen.findByRole("button", { name: "Invitations" }));
    expect(screen).toHavePathname("/invitations");
  });
});

describe("dashboard metrics come from real lists", () => {
  it("counts courses and people for an Admin, and marks a partial count with +", async () => {
    access.mockResolvedValue(ADMIN);
    await renderRouter(app, { initialUrl: "/dashboard" });
    expect(await screen.findByLabelText("Published courses: 3")).toBeTruthy();
    expect(screen.getByLabelText("Draft courses: 1")).toBeTruthy();
    expect(screen.getByLabelText("Instructors: 1")).toBeTruthy();
    expect(screen.getByLabelText("Pending invitations: 2+")).toBeTruthy();
  });

  it("shows Instructors only course counts, and Unavailable when a list fails", async () => {
    access.mockResolvedValue(INSTRUCTOR);
    (staffCourseApi.list as jest.Mock).mockRejectedValue(appError("unknown"));
    await renderRouter(app, { initialUrl: "/dashboard" });
    expect(await screen.findByLabelText("Published courses: unavailable")).toBeTruthy();
    expect(screen.queryByLabelText(/^Pending invitations/)).toBeNull();
    expect(screen.queryByLabelText(/^Instructors:/)).toBeNull();
  });

  it("shows a Manager invitations first, with no course metrics they cannot manage", async () => {
    access.mockResolvedValue({ ...MANAGER, permissions: ["instructors:invite"] });
    await renderRouter(app, { initialUrl: "/dashboard" });
    expect(await screen.findByLabelText("Pending invitations: 2+")).toBeTruthy();
    expect(screen.queryByLabelText(/^Published courses/)).toBeNull();
  });

  it("uses explicit rows for every role's numbers, so the heading below can never be overlapped", async () => {
    access.mockResolvedValue(MANAGER);
    await renderRouter(app, { initialUrl: "/dashboard" });
    await screen.findByTestId("metrics");
    const wrapping: unknown[] = [];
    const visit = (n: unknown) => {
      if (!n || typeof n === "string") return;
      const node = n as { props?: { style?: unknown }; children?: unknown[] };
      const st = StyleSheet.flatten(node.props?.style as never) ?? {};
      if (st.flexWrap === "wrap") wrapping.push(node);
      (node.children ?? []).forEach(visit);
    };
    const j = screen.toJSON();
    (Array.isArray(j) ? j : [j]).forEach(visit);
    expect(wrapping).toHaveLength(0);
  });
});
