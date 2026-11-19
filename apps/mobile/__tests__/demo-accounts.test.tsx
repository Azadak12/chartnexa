import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { testServer } from "../src/api/test-server";
import { accountApi } from "../src/auth/account-api";
import { sessionManager } from "../src/auth/session-manager";
import { DEMO_ACCOUNTS, demoAccountsEnabled, demoEmailOrNull } from "../src/dev/demo-accounts";
import { fetchAccess } from "../src/courses/course-api";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { sessionStore } from "../src/session/session-store";
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

const secure = SecureStore as unknown as { __reset: () => void };
const me = accountApi.me as unknown as jest.Mock;
const access = fetchAccess as unknown as jest.Mock;
const app = "./app";
const ENV = process.env["EXPO_PUBLIC_DEMO_ACCOUNTS"];

beforeEach(async () => {
  jest.restoreAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  process.env["EXPO_PUBLIC_DEMO_ACCOUNTS"] = "true";
  me.mockResolvedValue({
    id: "u1",
    email: "student@chartnexa.test",
    displayName: "Sam",
    emailVerified: true,
    createdAt: "2026-11-17T00:00:00.000Z",
  });
  access.mockResolvedValue({ roles: ["student"], permissions: [], courseGrants: [] });
});
afterAll(() => {
  if (ENV === undefined) delete process.env["EXPO_PUBLIC_DEMO_ACCOUNTS"];
  else process.env["EXPO_PUBLIC_DEMO_ACCOUNTS"] = ENV;
});

describe("when the hub is available", () => {
  it("is on only for a non-production build that opted in", () => {
    expect(demoAccountsEnabled()).toBe(true);
    process.env["EXPO_PUBLIC_DEMO_ACCOUNTS"] = "false";
    expect(demoAccountsEnabled()).toBe(false);
    delete process.env["EXPO_PUBLIC_DEMO_ACCOUNTS"];
    expect(demoAccountsEnabled()).toBe(false);
  });

  it("is never on in a production build, even if the flag is set", () => {
    jest.spyOn(testServer, "allowed").mockReturnValue(false);
    expect(demoAccountsEnabled()).toBe(false);
    expect(demoEmailOrNull("admin@chartnexa.test")).toBeNull();
  });

  it("is not set by the production build profile, and is set for development and preview only", () => {
    const eas = JSON.parse(readFileSync(join(__dirname, "../eas.json"), "utf8")).build;
    expect(eas.production.env.EXPO_PUBLIC_DEMO_ACCOUNTS).toBeUndefined();
    expect(eas.development.env.EXPO_PUBLIC_DEMO_ACCOUNTS).toBe("true");
    expect(eas.preview.env.EXPO_PUBLIC_DEMO_ACCOUNTS).toBe("true");
  });

  it("holds public emails only: no password, token, secret or recovery code in the source", () => {
    const src = readFileSync(join(__dirname, "../src/dev/demo-accounts.ts"), "utf8");
    expect(src).not.toMatch(/password\s*[:=]|token\s*[:=]|secret\s*[:=]|recovery\s*[:=]/i);
    expect(DEMO_ACCOUNTS.map((a) => a.email)).toEqual([
      "student@chartnexa.test",
      "instructor@chartnexa.test",
      "manager@chartnexa.test",
      "admin@chartnexa.test",
    ]);
    expect(Object.keys(DEMO_ACCOUNTS[0]!).sort()).toEqual(
      ["email", "role", "summary", "title", "twoStep"].sort(),
    );
  });

  it("prefills only the four demo emails", () => {
    expect(demoEmailOrNull("manager@chartnexa.test")).toBe("manager@chartnexa.test");
    expect(demoEmailOrNull("someone@else.com")).toBeNull();
    expect(demoEmailOrNull(undefined)).toBeNull();
  });
});

describe("the Sign In screen", () => {
  it("offers Demo accounts, which shows four role cards with email, summary and MFA notes", async () => {
    await renderRouter(app, { initialUrl: "/sign-in" });
    await fireEvent.press(await screen.findByRole("button", { name: "Try a demo account" }));
    expect(screen).toHavePathname("/demo-accounts");
    for (const r of ["student", "instructor", "manager", "admin"]) {
      expect(screen.getByTestId(`demo-${r}`)).toBeTruthy();
    }
    expect(screen.getByText("manager@chartnexa.test")).toBeTruthy();
    expect(screen.getAllByText("Two-step sign-in is required for this role.")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Sign in as Instructor" })).toBeTruthy();
  });

  it("opens the normal sign-in with the email filled in and the password empty", async () => {
    await renderRouter(app, { initialUrl: "/demo-accounts" });
    await fireEvent.press(await screen.findByRole("button", { name: "Sign in as Admin" }));
    expect(await screen.findByLabelText("Email")).toBeTruthy();
    expect(screen).toHavePathname("/sign-in");
    expect(screen.getByLabelText("Email").props.value).toBe("admin@chartnexa.test");
    expect(screen.getByLabelText("Password").props.value).toBe("");
  });

  it("does not fill in an address that is not a demo account", async () => {
    await renderRouter(app, { initialUrl: "/sign-in?email=victim@example.com" });
    expect((await screen.findByLabelText("Email")).props.value).toBe("");
  });

  it("is hidden from Sign In when demo accounts are off", async () => {
    process.env["EXPO_PUBLIC_DEMO_ACCOUNTS"] = "false";
    await renderRouter(app, { initialUrl: "/sign-in" });
    await screen.findByRole("button", { name: "Sign in" });
    expect(screen.queryByRole("button", { name: "Try a demo account" })).toBeNull();
    await screen.unmount();
    await renderRouter(app, { initialUrl: "/demo-accounts" });
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(screen.queryByTestId("demo-admin")).toBeNull();
  });
});

describe("when signed in", () => {
  beforeEach(async () => {
    await sessionManager.signIn(pair());
  });

  it("appears under Demo accounts in Profile, marks the current account, and disables it", async () => {
    await renderRouter(app, { initialUrl: "/profile" });
    await fireEvent.press(await screen.findByRole("button", { name: "Demo accounts" }));
    expect(await screen.findByTestId("demo-student-current")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Signed in as Student" }).props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it("switches account by a normal sign-out, then the normal sign-in screen", async () => {
    const signOut = jest.spyOn(sessionManager, "signOut");
    await renderRouter(app, { initialUrl: "/demo-accounts" });
    await fireEvent.press(await screen.findByRole("button", { name: "Sign in as Manager" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(await screen.findByLabelText("Email")).toBeTruthy();
    expect(screen).toHavePathname("/sign-in");
    expect(sessionStore.get()).toBe("signed-out");
    expect(screen.getByLabelText("Email").props.value).toBe("manager@chartnexa.test");
  });

  it("is reachable from the Admin's More tab, which is the Profile screen with Sign out", async () => {
    access.mockResolvedValue({
      roles: ["student", "admin"],
      permissions: ["audit:read"],
      courseGrants: [],
    });
    await renderRouter(app, { initialUrl: "/more" });
    expect(await screen.findByRole("button", { name: "Demo accounts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});
