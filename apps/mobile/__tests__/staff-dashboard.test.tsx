import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Text } from "react-native";
import { fetchAccess } from "../src/courses/course-api";
import { StaffDashboardScreen } from "../src/staff/StaffDashboardScreen";
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
/** The dashboard on its own route, so each role can be tried without the tab bar. */
const alone = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderRouter({
    _layout: () => {
      const { Slot } = jest.requireActual("expo-router");
      return (
        <QueryClientProvider client={client}>
          <Slot />
        </QueryClientProvider>
      );
    },
    index: StaffDashboardScreen,
    "profile/audit": () => <Text>Audit screen</Text>,
  });
};
const STUDENT = { roles: ["student"], permissions: [], courseGrants: [] };
const INSTRUCTOR = {
  roles: ["student", "instructor"],
  permissions: ["course:create"],
  courseGrants: [{ courseId: "c1", permissions: ["course:update", "assignments:manage"] }],
};
const MANAGER = {
  roles: ["student", "manager"],
  permissions: [
    "course:create",
    "course:update",
    "categories:manage",
    "enrollments:manage",
    "instructors:invite",
    "instructor_permissions:manage",
    "announcements:publish",
    "reviews:moderate",
    "payments:read_status",
    "users:read",
  ],
  courseGrants: [],
};
const ADMIN = {
  ...MANAGER,
  roles: ["student", "admin"],
  permissions: [...MANAGER.permissions, "audit:read", "roles:manage"],
};

beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
});

describe("navigation by role", () => {
  it("shows students five familiar tabs and no Dashboard", async () => {
    access.mockResolvedValue(STUDENT);
    await renderRouter(app, { initialUrl: "/home" });
    for (const name of ["Home", "My Learning", "Assignments", "Profile"]) {
      expect(await screen.findByRole("button", { name })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "Dashboard" })).toBeNull();
  });

  it("shows staff a Dashboard tab that opens their dashboard", async () => {
    access.mockResolvedValue(MANAGER);
    await renderRouter(app, { initialUrl: "/home" });
    await fireEvent.press(await screen.findByRole("button", { name: "Dashboard" }));
    expect(await screen.findByText("Manager dashboard")).toBeTruthy();
  });
});

describe("the staff dashboard", () => {
  it("offers an Instructor only teaching tools, never people or operations", async () => {
    access.mockResolvedValue(INSTRUCTOR);
    await alone();
    expect(await screen.findByText("Instructor Studio")).toBeTruthy();
    expect(screen.getByTestId("tile-Courses")).toBeTruthy();
    for (const tile of [
      "Instructors",
      "Orders",
      "Audit log",
      "Announcements",
      "Categories",
      "Review moderation",
    ]) {
      expect(screen.queryByTestId(`tile-${tile}`)).toBeNull();
    }
  });

  it("gives a Manager people and operations tools but not the audit log", async () => {
    access.mockResolvedValue(MANAGER);
    await alone();
    for (const tile of [
      "Courses",
      "Categories",
      "Instructors",
      "Announcements",
      "Orders",
      "Review moderation",
    ]) {
      expect(await screen.findByTestId(`tile-${tile}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("tile-Audit log")).toBeNull();
  });

  it("gives an Admin everything, and every tile opens its screen", async () => {
    access.mockResolvedValue(ADMIN);
    await alone();
    expect(await screen.findByText("Admin Dashboard")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("tile-Audit log"));
    expect(screen).toHavePathname("/profile/audit");
    expect(screen.getByText("Audit screen")).toBeTruthy();
  });

  it("is not available to students, and shows an error with Retry", async () => {
    access.mockResolvedValue(STUDENT);
    await alone();
    expect(await screen.findByText("Not available")).toBeTruthy();
    await screen.unmount();
    access.mockRejectedValueOnce(appError("unknown"));
    await alone();
    await fireEvent.press(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Not available")).toBeTruthy();
  });
});
