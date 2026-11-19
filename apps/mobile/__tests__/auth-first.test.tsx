import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { fetchAccess } from "../src/courses/course-api";
import { sessionManager } from "../src/auth/session-manager";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { sessionStore } from "../src/session/session-store";
import { landingFor } from "../src/navigation/landing";
import { pair } from "../test-utils/auth-mocks";

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

const app = "./app";
const access = fetchAccess as unknown as jest.Mock;
const ROLES = {
  student: { roles: ["student"], permissions: [], courseGrants: [] },
  instructor: { roles: ["student", "instructor"], permissions: [], courseGrants: [] },
  manager: { roles: ["student", "manager"], permissions: ["instructors:invite"], courseGrants: [] },
  admin: { roles: ["student", "admin"], permissions: ["audit:read"], courseGrants: [] },
};
const signInHeader = () => screen.queryByRole("header", { name: "Welcome back" });

beforeEach(async () => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  access.mockResolvedValue(ROLES.student);
});

describe("signed out: Sign In first, nothing public before it", () => {
  it("opens on Sign In with email, password, Forgot password and the Sign in button", async () => {
    await renderRouter(app, { initialUrl: "/" });
    await waitFor(() => expect(screen).toHavePathname("/sign-in"));
    expect(await screen.findByRole("header", { name: "Welcome back" })).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText("Don't have an account?")).toBeTruthy();
  });

  it("has no Welcome page, and no tab bar on either authentication screen", async () => {
    await renderRouter(app, { initialUrl: "/welcome" });
    expect(await screen.findByText("Page not found")).toBeTruthy();
    expect(screen.queryByText("Learn the Market. Master the Skills.")).toBeNull();
    await screen.unmount();
    for (const url of ["/sign-in", "/register"]) {
      await renderRouter(app, { initialUrl: url });
      await waitFor(() => expect(screen).toHavePathname(url));
      expect(screen.queryByTestId("tab-bar")).toBeNull();
      await screen.unmount();
    }
  });

  it("goes between Sign In and Sign Up with the bottom links", async () => {
    await renderRouter(app, { initialUrl: "/sign-in" });
    await fireEvent.press(await screen.findByRole("button", { name: "Sign up" }));
    expect(await screen.findByRole("header", { name: "Create your account" })).toBeTruthy();
    expect(screen.getByText("Already have an account?")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("header", { name: "Welcome back" })).toBeTruthy();
    expect(screen).toHavePathname("/sign-in");
  });

  it.each([
    "/home",
    "/explore",
    "/courses",
    "/assignments",
    "/profile",
    "/dashboard",
    "/more",
    "/lab",
    "/course/c1",
    "/course/c1/lesson/l1",
    "/assignment/a1",
    "/checkout/o1",
    "/manage",
  ])("sends a signed-out link to %s to Sign In, remembering it", async (url) => {
    await renderRouter(app, { initialUrl: url });
    await waitFor(() => expect(screen).toHavePathname("/sign-in"));
    expect(screen).toHaveSearchParams({ returnTo: url });
    expect(await screen.findByRole("header", { name: "Welcome back" })).toBeTruthy();
  });

  it("keeps the password recovery, verification and invitation screens reachable", async () => {
    for (const url of [
      "/forgot-password",
      "/reset-password?token=abcdefghijklmnopqrstuvwxyz",
      "/verify-email?token=abcdefghijklmnopqrstuvwxyz",
      "/accept-invitation",
    ]) {
      await renderRouter(app, { initialUrl: url });
      await waitFor(() => expect(screen).toHavePathname(url.split("?")[0]!));
      expect(signInHeader()).toBeNull();
      await screen.unmount();
    }
  });
});

describe("signed in: straight to the role's page, never through Sign In", () => {
  it.each([
    ["student", "/home"],
    ["instructor", "/dashboard"],
    ["manager", "/dashboard"],
    ["admin", "/dashboard"],
  ] as const)("an existing %s session opens %s", async (role, path) => {
    access.mockResolvedValue(ROLES[role]);
    await sessionManager.signIn(pair());
    await renderRouter(app, { initialUrl: "/" });
    // Sign In is not shown, not even for a moment, on the way.
    expect(signInHeader()).toBeNull();
    await waitFor(() => expect(screen).toHavePathname(path));
    expect(signInHeader()).toBeNull();
  });

  it("shows only a plain loading view while the role is being read", async () => {
    let release!: (v: unknown) => void;
    access.mockImplementation(() => new Promise((r) => (release = r)));
    await sessionManager.signIn(pair());
    await renderRouter(app, { initialUrl: "/" });
    expect(await screen.findByTestId("gate-loading")).toBeTruthy();
    expect(signInHeader()).toBeNull();
    expect(screen.queryByTestId("tab-bar")).toBeNull();
    await act(async () => release(ROLES.instructor));
    await waitFor(() => expect(screen).toHavePathname("/dashboard"));
  });

  it.each([
    ["student", "/home"],
    ["instructor", "/dashboard"],
    ["manager", "/dashboard"],
    ["admin", "/dashboard"],
  ] as const)("a signed-in %s on Sign In or Sign Up is moved on to %s", async (role, path) => {
    access.mockResolvedValue(ROLES[role]);
    await sessionManager.signIn(pair());
    for (const url of ["/sign-in", "/register"]) {
      await renderRouter(app, { initialUrl: url });
      await waitFor(() => expect(screen).toHavePathname(path));
      await screen.unmount();
    }
  });

  it("maps each role to its landing page, and falls back to Student Home when unknown", () => {
    expect(landingFor(ROLES.student as never)).toBe("/home");
    expect(landingFor(ROLES.instructor as never)).toBe("/dashboard");
    expect(landingFor(ROLES.manager as never)).toBe("/dashboard");
    expect(landingFor(ROLES.admin as never)).toBe("/dashboard");
    expect(landingFor(undefined)).toBe("/home");
  });

  it("falls back to Student Home if the role cannot be read, leaving the server to decide access", async () => {
    access.mockRejectedValue(new Error("down"));
    await sessionManager.signIn(pair());
    await renderRouter(app, { initialUrl: "/" });
    await waitFor(() => expect(screen).toHavePathname("/home"));
  });
});

describe("ending a session", () => {
  it("signing out lands on Sign In, and Back cannot return to a protected screen", async () => {
    await sessionManager.signIn(pair());
    await renderRouter(app, { initialUrl: "/home" });
    await waitFor(() => expect(screen).toHavePathname("/home"));
    await act(async () => router.push("/course/c1"));
    await act(async () => {
      await sessionManager.signOut();
    });
    await waitFor(() => expect(screen).toHavePathname("/sign-in"));
    expect(router.canGoBack()).toBe(false);
    await act(async () => router.back());
    expect(screen).toHavePathname("/sign-in");
    expect(await screen.findByRole("header", { name: "Welcome back" })).toBeTruthy();
    expect(screen.queryByTestId("tab-bar")).toBeNull();
  });

  it("an expired session lands on Sign In and returns to the same screen after signing in again", async () => {
    await sessionManager.signIn(pair());
    await renderRouter(app, { initialUrl: "/course/c7" });
    await waitFor(() => expect(screen).toHavePathname("/course/c7"));
    await act(async () => sessionStore.expire());
    await waitFor(() => expect(screen).toHavePathname("/sign-in"));
    expect(screen).toHaveSearchParams({ returnTo: "/course/c7" });
    expect(router.canGoBack()).toBe(false);
    await act(async () => sessionStore.set("signed-in"));
    await waitFor(() => expect(screen).toHavePathname("/course/c7"));
  });

  it("clears cached account data so the next person never sees it", async () => {
    await sessionManager.signIn(pair());
    await renderRouter(app, { initialUrl: "/home" });
    await waitFor(() => expect(screen).toHavePathname("/home"));
    await act(async () => {
      await sessionManager.signOut();
    });
    await waitFor(() => expect(screen).toHavePathname("/sign-in"));
    expect(screen.queryByText("Good morning, Ann")).toBeNull();
    expect(screen.queryByText(/Good (morning|afternoon|evening), Ann/)).toBeNull();
  });

  it("switching accounts opens each role's own page, with no data from the one before", async () => {
    const order = ["admin", "student", "instructor", "manager"] as const;
    const landing = {
      admin: "/dashboard",
      student: "/home",
      instructor: "/dashboard",
      manager: "/dashboard",
    };
    await renderRouter(app, { initialUrl: "/" });
    await waitFor(() => expect(screen).toHavePathname("/sign-in"));
    for (const who of order) {
      access.mockResolvedValue(ROLES[who]);
      await act(async () => {
        await sessionManager.signIn(pair());
      });
      await waitFor(() => expect(screen).toHavePathname(landing[who]));
      if (who === "admin") expect(await screen.findByText("Admin Dashboard")).toBeTruthy();
      if (who === "manager") expect(await screen.findByText("Manager dashboard")).toBeTruthy();
      if (who === "instructor")
        expect(await screen.findByText("Instructor dashboard")).toBeTruthy();
      // The previous person's dashboard is gone.
      if (who !== "admin") expect(screen.queryByText("Admin Dashboard")).toBeNull();
      await act(async () => {
        await sessionManager.signOut();
      });
      await waitFor(() => expect(screen).toHavePathname("/sign-in"));
      expect(router.canGoBack()).toBe(false);
    }
  });
});
