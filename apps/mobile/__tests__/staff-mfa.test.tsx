import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo, Linking, Share } from "react-native";
import * as SecureStore from "expo-secure-store";
import { authHttp } from "../src/auth/auth-http";
import { mfaFlow } from "../src/auth/mfa-flow";
import { mfaApi } from "../src/auth/mfa-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { fetchAccess } from "../src/courses/course-api";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { mockBackHandler } from "../test-utils/back-handler";
import { appError, pair } from "../test-utils/auth-mocks";

jest.mock("../src/auth/auth-http", () => ({
  authHttp: {
    login: jest.fn(),
    register: jest.fn(),
    refresh: jest.fn(),
    verifyEmail: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    logout: jest.fn(),
    verifyMfa: jest.fn(),
    startMfaSetup: jest.fn(),
    completeMfaSetup: jest.fn(),
  },
}));
jest.mock("../src/auth/mfa-api", () => ({ mfaApi: { status: jest.fn(), regenerate: jest.fn() } }));
jest.mock("../src/auth/account-api", () => ({
  accountApi: {
    me: jest.fn().mockResolvedValue({
      id: "u1",
      email: "boss@example.com",
      displayName: "Boss",
      emailVerified: true,
      createdAt: "2026-11-17T00:00:00.000Z",
    }),
    resendVerification: jest.fn(),
  },
}));
jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
  fetchAccess: jest.fn(),
}));

let back: ReturnType<typeof mockBackHandler>;
const http = authHttp as unknown as Record<
  "login" | "verifyMfa" | "startMfaSetup" | "completeMfaSetup",
  jest.Mock
>;
const mfa = mfaApi as unknown as { status: jest.Mock; regenerate: jest.Mock };
const access = fetchAccess as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
const app = "./app";

const challenge = (status: "mfa_required" | "mfa_setup_required" = "mfa_required", over = {}) => ({
  status,
  challengeToken: "challenge-token-0000000000000000000000",
  expiresInSeconds: 300,
  ...over,
});
const CODES = Array.from({ length: 10 }, (_, i) => `abcd-efgh-jk${String(i).padStart(2, "m")}`);
const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));
const signInWith = async () => {
  await type("Email", "boss@example.com");
  await type("Password", "a long passphrase here");
  await press("Sign in");
};

beforeEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  back = mockBackHandler();
  secure.__reset();
  clearScreenMemory();
  mfaFlow.clear();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  access.mockResolvedValue({ roles: ["student", "manager"], permissions: [] });
});

describe("sign-in with a second step", () => {
  const toCodeScreen = async (returnTo?: string) => {
    http.login.mockResolvedValue(challenge("mfa_required"));
    await renderRouter(app, {
      initialUrl: returnTo ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}` : "/sign-in",
    });
    await signInWith();
    await screen.findByLabelText("Authentication code");
  };

  it("goes to the code screen without putting the challenge in the address", async () => {
    await toCodeScreen("/course/c1");
    expect(screen).toHavePathname("/two-step");
    expect(screen).toHaveSearchParams({ returnTo: "/course/c1" });
    expect(sessionStore.get()).toBe("signed-out");
    expect(screen.getByText("Enter the 6-digit code from your authenticator app.")).toBeTruthy();
  });

  it("signs in with the right code and goes where the person was headed", async () => {
    http.verifyMfa.mockResolvedValue({ ...pair(), recoveryCodesRemaining: null });
    await toCodeScreen("/course/c4");
    await type("Authentication code", "123456");
    await press("Verify");
    await waitFor(() => expect(sessionStore.get()).toBe("signed-in"));
    expect(http.verifyMfa).toHaveBeenCalledWith({
      challengeToken: "challenge-token-0000000000000000000000",
      code: "123456",
    });
    await waitFor(() => expect(screen).toHavePathname("/course/c4"));
    expect(mfaFlow.get()).toBeNull();
  });

  it("keeps the Verify button off until six characters are typed, and sends one request when pressed twice", async () => {
    let finish!: () => void;
    http.verifyMfa.mockImplementation(
      () => new Promise((r) => (finish = () => r({ ...pair(), recoveryCodesRemaining: null }))),
    );
    await toCodeScreen();
    expect(screen.getByRole("button", { name: "Verify" }).props.accessibilityState.disabled).toBe(
      true,
    );
    await type("Authentication code", "123456");
    const b = screen.getByRole("button", { name: "Verify" });
    await fireEvent.press(b);
    await fireEvent.press(b);
    expect(http.verifyMfa).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it("explains a wrong code, clears the field, announces it, and suggests signing in again after three", async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    http.verifyMfa.mockRejectedValue(appError("unauthorized"));
    await toCodeScreen();
    for (let i = 1; i <= 3; i++) {
      await type("Authentication code", "000000");
      await press("Verify");
      await screen.findByTestId("form-error");
      expect(screen.getByLabelText("Authentication code").props.value).toBe("");
    }
    expect(screen.getByText(/go back and sign in again/)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("The code did not work");
    expect(sessionStore.get()).toBe("signed-out");
  });

  it("shows the server's wait message when too many tries were made", async () => {
    http.verifyMfa.mockRejectedValue(appError("rate_limited", { retryAfter: 120 }));
    await toCodeScreen();
    await type("Authentication code", "000000");
    await press("Verify");
    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
  });

  it("refuses an expired challenge without asking the server", async () => {
    http.login.mockResolvedValue(challenge("mfa_required", { expiresInSeconds: 0 }));
    await renderRouter(app, { initialUrl: "/sign-in" });
    await signInWith();
    await screen.findByLabelText("Authentication code");
    await type("Authentication code", "123456");
    await press("Verify");
    expect(await screen.findByText(/took too long/)).toBeTruthy();
    expect(http.verifyMfa).not.toHaveBeenCalled();
  });

  it("accepts a recovery code and says how many remain before signing in", async () => {
    http.verifyMfa.mockResolvedValue({ ...pair(), recoveryCodesRemaining: 9 });
    await toCodeScreen();
    await press("Use a recovery code");
    expect(screen.getByLabelText("Recovery code")).toBeTruthy();
    await type("Recovery code", "abcd-efgh-jkmn");
    await press("Verify");
    expect(await screen.findByTestId("recovery-remaining")).toBeTruthy();
    expect(screen.getByText("You have 9 recovery codes left. Each works once.")).toBeTruthy();
    expect(sessionStore.get()).toBe("signed-out");
    await press("Continue");
    await waitFor(() => expect(sessionStore.get()).toBe("signed-in"));
  });

  it("warns plainly when the last recovery code was used", async () => {
    http.verifyMfa.mockResolvedValue({ ...pair(), recoveryCodesRemaining: 0 });
    await toCodeScreen();
    await press("Use a recovery code");
    await type("Recovery code", "abcd-efgh-jkmn");
    await press("Verify");
    expect(await screen.findByText(/no recovery codes left/)).toBeTruthy();
  });

  it("goes back to sign-in and forgets the challenge", async () => {
    await toCodeScreen();
    await press("Back to sign-in");
    expect(screen).toHavePathname("/sign-in");
    expect(mfaFlow.get()).toBeNull();
  });

  it("sends a person who opens the code screen with no challenge to sign-in", async () => {
    await renderRouter(app, { initialUrl: "/two-step" });
    await waitFor(() => expect(screen).toHavePathname("/sign-in"));
  });

  it("does not use two-step screens for people who get tokens straight away", async () => {
    http.login.mockResolvedValue(pair());
    await renderRouter(app, { initialUrl: "/sign-in" });
    await signInWith();
    await waitFor(() => expect(sessionStore.get()).toBe("signed-in"));
    expect(http.verifyMfa).not.toHaveBeenCalled();
  });
});

describe("enrollment", () => {
  const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  const start = {
    secret: SECRET,
    otpauthUri: `otpauth://totp/ChartNexa:boss%40example.com?secret=${SECRET}`,
    accountName: "boss@example.com",
  };
  const toSetup = async () => {
    http.login.mockResolvedValue(challenge("mfa_setup_required"));
    http.startMfaSetup.mockResolvedValue(start);
    await renderRouter(app, { initialUrl: "/sign-in" });
    await signInWith();
    await screen.findByTestId("setup-key");
  };

  it("shows the key in groups, once, with an accessible reading", async () => {
    await toSetup();
    expect(screen).toHavePathname("/two-step-setup");
    expect(http.startMfaSetup).toHaveBeenCalledTimes(1);
    expect(http.startMfaSetup).toHaveBeenCalledWith("challenge-token-0000000000000000000000");
    expect(screen.getByText("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP")).toBeTruthy();
    expect(screen.getByTestId("setup-key").props.accessibilityLabel).toMatch(/^Setup key: J B S W/);
  });

  it("opens the authenticator app, and says what to do when none opens", async () => {
    await toSetup();
    const can = jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
    await press("Open authenticator app");
    expect(open).toHaveBeenCalledWith(start.otpauthUri);
    can.mockResolvedValue(false);
    await press("Open authenticator app");
    expect(await screen.findByTestId("setup-hint")).toBeTruthy();
  });

  it("offers to copy or share the key", async () => {
    await toSetup();
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    await press("Copy or share key");
    expect(share).toHaveBeenCalledWith({ message: SECRET });
  });

  it("keeps Continue off until six digits, and explains a wrong first code without signing in", async () => {
    await toSetup();
    expect(screen.getByRole("button", { name: "Continue" }).props.accessibilityState.disabled).toBe(
      true,
    );
    http.completeMfaSetup.mockRejectedValue(appError("unauthorized"));
    await type("First code from the app", "000000");
    await press("Continue");
    expect(await screen.findByText(/That code did not work/)).toBeTruthy();
    expect(screen.getByLabelText("First code from the app").props.value).toBe("");
    expect(sessionStore.get()).toBe("signed-out");
  });

  it("shows the recovery codes once, requires confirmation, then signs in", async () => {
    await toSetup();
    http.completeMfaSetup.mockResolvedValue({ ...pair(), recoveryCodes: CODES });
    await type("First code from the app", "123456");
    await press("Continue");
    expect(await screen.findByTestId("recovery-codes")).toBeTruthy();
    expect(screen).toHavePathname("/recovery-codes");
    expect(sessionStore.get()).toBe("signed-out");
    for (const c of CODES) expect(screen.getByText(new RegExp(c))).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" }).props.accessibilityState.disabled).toBe(
      true,
    );
    await fireEvent.press(screen.getByRole("checkbox", { name: "I saved these codes" }));
    expect(
      screen.getByRole("checkbox", { name: "I saved these codes" }).props.accessibilityState
        .checked,
    ).toBe(true);
    await press("Continue");
    await waitFor(() => expect(sessionStore.get()).toBe("signed-in"));
    expect(mfaFlow.get()).toBeNull();
  });

  it("lets the codes be shared", async () => {
    await toSetup();
    http.completeMfaSetup.mockResolvedValue({ ...pair(), recoveryCodes: CODES });
    await type("First code from the app", "123456");
    await press("Continue");
    await screen.findByTestId("recovery-codes");
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    await press("Copy or share codes");
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining(CODES[0]!) }),
    );
  });

  it("warns before leaving the recovery codes unsaved", async () => {
    await toSetup();
    http.completeMfaSetup.mockResolvedValue({ ...pair(), recoveryCodes: CODES });
    await type("First code from the app", "123456");
    await press("Continue");
    await screen.findByTestId("recovery-codes");
    await act(async () => void back.pressBack());
    expect(await screen.findByText("Leave without saving?")).toBeTruthy();
    expect(sessionStore.get()).toBe("signed-out");
    await press("Continue without saving");
    await waitFor(() => expect(sessionStore.get()).toBe("signed-in"));
  });

  it("shows an error with a way back when the key cannot be made", async () => {
    http.login.mockResolvedValue(challenge("mfa_setup_required"));
    http.startMfaSetup.mockRejectedValue(appError("unauthorized"));
    await renderRouter(app, { initialUrl: "/sign-in" });
    await signInWith();
    expect(await screen.findByTestId("state-error")).toBeTruthy();
    await press("Back to sign-in");
    expect(screen).toHavePathname("/sign-in");
  });
});

describe("Profile", () => {
  beforeEach(async () => {
    await sessionManager.signIn(pair());
  });

  it("shows the two-step row to staff only", async () => {
    mfa.status.mockResolvedValue({ required: true, enabled: true, recoveryCodesRemaining: 7 });
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByRole("button", { name: "Two-step sign-in: On" })).toBeTruthy();
    await screen.unmount();

    jest.clearAllMocks();
    access.mockResolvedValue({ roles: ["student"], permissions: [] });
    await renderRouter(app, { initialUrl: "/profile" });
    await screen.findByText("Boss");
    expect(screen.queryByRole("button", { name: /Two-step sign-in/ })).toBeNull();
    expect(mfa.status).not.toHaveBeenCalled();
  });

  it("does not show it to an Instructor", async () => {
    access.mockResolvedValue({ roles: ["student", "instructor"], permissions: [] });
    await renderRouter(app, { initialUrl: "/profile" });
    await screen.findByText("Boss");
    expect(screen.queryByRole("button", { name: /Two-step sign-in/ })).toBeNull();
    expect(mfa.status).not.toHaveBeenCalled();
  });

  it("shows the status and regenerates codes with a password and a code", async () => {
    mfa.status.mockResolvedValue({ required: true, enabled: true, recoveryCodesRemaining: 3 });
    mfa.regenerate.mockResolvedValue(CODES);
    await renderRouter(app, { initialUrl: "/profile" });
    await fireEvent.press(await screen.findByRole("button", { name: "Two-step sign-in: On" }));
    expect(screen).toHavePathname("/profile/two-step");
    expect(await screen.findByTestId("mfa-state")).toBeTruthy();
    expect(screen.getByText("Two-step sign-in: On")).toBeTruthy();
    expect(screen.getByText("3 recovery codes left")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Get new recovery codes" }).props.accessibilityState
        .disabled,
    ).toBe(true);
    await type("Password", "a long passphrase here");
    await type("Authenticator code", "123456");
    await press("Get new recovery codes");
    expect(await screen.findByTestId("recovery-codes")).toBeTruthy();
    expect(mfa.regenerate).toHaveBeenCalledWith({
      password: "a long passphrase here",
      code: "123456",
    });
    expect(screen.getByText("The old codes no longer work.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("checkbox", { name: "I saved these codes" }));
    await press("Done");
    await waitFor(() => expect(screen).toHavePathname("/profile"));
  });

  it("explains a refused request, clears the code, and keeps the password", async () => {
    mfa.status.mockResolvedValue({ required: true, enabled: true, recoveryCodesRemaining: 3 });
    mfa.regenerate.mockRejectedValue(appError("unauthorized"));
    await renderRouter(app, { initialUrl: "/profile/two-step" });
    await screen.findByTestId("mfa-state");
    await type("Password", "wrong password value");
    await type("Authenticator code", "123456");
    await press("Get new recovery codes");
    expect(await screen.findByText(/password or code did not work/)).toBeTruthy();
    expect(screen.getByLabelText("Authenticator code").props.value).toBe("");
    expect(screen.getByLabelText("Password").props.value).toBe("wrong password value");
  });

  it("says plainly when it is not required", async () => {
    mfa.status.mockResolvedValue({ required: false, enabled: false, recoveryCodesRemaining: 0 });
    await renderRouter(app, { initialUrl: "/profile/two-step" });
    expect(
      await screen.findByText("Two-step sign-in is not required for your account."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Get new recovery codes" })).toBeNull();
  });
});
