import { renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { fetchAccess } from "../src/courses/course-api";
import { initialsOf } from "../src/auth/screens/ProfileScreen";
import { accountApi } from "../src/auth/account-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { pair } from "../test-utils/auth-mocks";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
  fetchAccess: jest.fn(),
}));
jest.mock("../src/auth/account-api", () => ({
  accountApi: { me: jest.fn(), resendVerification: jest.fn(), updateProfile: jest.fn() },
}));
jest.mock("../src/auth/mfa-api", () => ({
  mfaApi: { status: jest.fn(async () => ({ required: false, enabled: false })) },
}));

const access = fetchAccess as unknown as jest.Mock;
const me = accountApi.me as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
const app = "./app";
const profile = (over: Record<string, unknown> = {}) => ({
  id: "u1",
  email: "ann@example.com",
  displayName: "Ann Lee",
  emailVerified: true,
  createdAt: "2026-11-17T00:00:00.000Z",
  ...over,
});

beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  me.mockResolvedValue(profile());
  access.mockResolvedValue({ roles: ["student"], permissions: [], courseGrants: [] });
});

describe("initials", () => {
  it("uses two words, one word, or the email, never a blank", () => {
    expect(initialsOf("Ann Lee", "x@y.co")).toBe("AL");
    expect(initialsOf("  ann  marie  lee ", "x@y.co")).toBe("AL");
    expect(initialsOf("ann", "x@y.co")).toBe("AN");
    expect(initialsOf(null, "zed@y.co")).toBe("Z");
    expect(initialsOf("", "")).toBe("?");
  });
});

describe("profile menu", () => {
  it("groups rows under Account, Learning & Purchases and Security, with no staff tools for a student", async () => {
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByTestId("profile-avatar", { hidden: true })).toBeTruthy();
    // Every tab screen has the persistent top bar.
    expect(screen.getByTestId("top-bar")).toBeTruthy();
    // The top bar shows the same initials, so more than one match is expected.
    expect(screen.getAllByText("AL", { hidden: true }).length).toBeGreaterThan(0);
    for (const h of ["Account", "Learning & Purchases", "Security"]) {
      expect(screen.getByText(h)).toBeTruthy();
    }
    expect(screen.queryByText("Staff tools")).toBeNull();
    for (const r of ["Edit name", "Purchases", "Change password", "Active sessions"]) {
      expect(screen.getByRole("button", { name: r })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByTestId("verify-notice")).toBeNull();
  });

  it("shows a verification prompt only when the email is not verified", async () => {
    me.mockResolvedValue(profile({ emailVerified: false }));
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByText("Email not verified")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: /resend/i })).toBeTruthy());
  });

  it("lists staff tools by permission only", async () => {
    access.mockResolvedValue({
      roles: ["admin"],
      permissions: ["courses:manage", "audit:read"],
      courseGrants: [],
    });
    await renderRouter(app, { initialUrl: "/profile" });
    await screen.findByTestId("profile-avatar", { hidden: true });
    await waitFor(() => expect(screen.getByText("Staff tools")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Orders" })).toBeNull();
  });
});
