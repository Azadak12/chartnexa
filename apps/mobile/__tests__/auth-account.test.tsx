import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { renderHook } from "@testing-library/react-native";
import { router, useNavigationContainerRef } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { accountApi } from "../src/auth/account-api";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import * as focus from "../src/ui/focus";
import { appError, pair } from "../test-utils/auth-mocks";
import { mockBackHandler } from "../test-utils/back-handler";
import { spyOnConsole } from "../test-utils/auth-mocks";

jest.mock("../src/auth/auth-http", () => ({
  authHttp: { login: jest.fn(), refresh: jest.fn(), logout: jest.fn() },
}));
jest.mock("../src/auth/account-api", () => ({
  accountApi: {
    me: jest.fn(),
    updateProfile: jest.fn(),
    changePassword: jest.fn(),
    deleteAccount: jest.fn(),
    resendVerification: jest.fn(),
    listSessions: jest.fn(),
    revokeSession: jest.fn(),
    logoutEverywhere: jest.fn(),
  },
}));

const api = accountApi as unknown as Record<keyof typeof accountApi, jest.Mock>;
const http = authHttp as unknown as Record<"logout", jest.Mock>;
const secure = SecureStore as unknown as {
  __reset: () => void;
  __dump: () => Record<string, string>;
};
const app = "./app";

const me = (over: Record<string, unknown> = {}) => ({
  id: "u1",
  email: "ann@example.com",
  displayName: "Ann",
  emailVerified: true,
  createdAt: "2026-11-17T08:00:00.000Z",
  ...over,
});
const session = (id: string, current: boolean, label = "Pixel 9") => ({
  id,
  deviceLabel: label,
  createdAt: "2026-11-17T08:00:00.000Z",
  lastUsedAt: "2026-11-17T09:00:00.000Z",
  current,
});

const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));
const hidden = { includeHiddenElements: true };

/** Presses the Android back button; an open sheet or dialog must handle it before navigation. */
const back = mockBackHandler();
const pressBackInModal = () =>
  act(async () => {
    back.pressBack();
  });

beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  sessionStore.setNotice(null);
  api.me.mockResolvedValue(me());
  await sessionManager.signIn(pair());
});

describe("profile overview", () => {
  it("shows the caller's name, email and a verified indicator with text", async () => {
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByText("Ann")).toBeTruthy();
    expect(screen.getByText("ann@example.com")).toBeTruthy();
    expect(screen.getByText("Email verified")).toBeTruthy();
    expect(screen.queryByTestId("verify-notice")).toBeNull();
    expect(api.me).toHaveBeenCalledTimes(1);
  });

  it("shows a notice and a resend action once for an unverified email", async () => {
    api.me.mockResolvedValue(me({ emailVerified: false }));
    api.resendVerification.mockResolvedValue(undefined);
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByText("Email not verified")).toBeTruthy();
    expect(screen.getByTestId("verify-notice")).toBeTruthy();
    await press("Resend verification email");
    await press("Email sent").catch(() => undefined);
    expect(api.resendVerification).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Email sent" }).props.accessibilityState.disabled,
    ).toBe(true);
  });

  it("shows the standard loading and error states, with a working Retry", async () => {
    api.me.mockRejectedValueOnce(appError("forbidden")).mockResolvedValueOnce(me());
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByTestId("state-error")).toBeTruthy();
    await press("Retry");
    expect(await screen.findByText("Ann")).toBeTruthy();
  });
});

describe("edit name", () => {
  it("saves in a sheet, closes it, returns focus to the edit control and shows the new name", async () => {
    const focusSpy = jest.spyOn(focus, "focusElement").mockImplementation(() => undefined);
    api.updateProfile.mockResolvedValue(me({ displayName: "Annie" }));
    await renderRouter(app, { initialUrl: "/profile" });
    await screen.findByText("Ann");
    await press("Edit name");
    api.me.mockResolvedValue(me({ displayName: "Annie" }));
    await type("Name", "Annie");
    await press("Save");
    expect(api.updateProfile).toHaveBeenCalledWith({ displayName: "Annie" });
    expect(await screen.findByText("Annie")).toBeTruthy();
    expect(screen.queryByTestId("bottom-sheet", hidden)).toBeNull();
    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  it("shows validation beside the field and sends nothing for an empty name", async () => {
    await renderRouter(app, { initialUrl: "/profile" });
    await screen.findByText("Ann");
    await press("Edit name");
    await type("Name", "");
    await press("Save");
    expect(api.updateProfile).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("field-error", hidden).length).toBeGreaterThan(0);
  });

  it("closes on back without saving", async () => {
    await renderRouter(app, { initialUrl: "/profile" });
    await screen.findByText("Ann");
    await press("Edit name");
    await type("Name", "Changed");
    await pressBackInModal();
    expect(api.updateProfile).not.toHaveBeenCalled();
    expect(screen.queryByTestId("bottom-sheet", hidden)).toBeNull();
  });
});

describe("change password", () => {
  const open = async () => {
    await renderRouter(app, { initialUrl: "/profile/change-password" });
  };

  it("confirms success and keeps this device signed in", async () => {
    api.changePassword.mockResolvedValue(undefined);
    await open();
    await type("Current password", "old passphrase value");
    await type("New password", "a brand new passphrase");
    await press("Change password");
    expect(api.changePassword).toHaveBeenCalledWith({
      currentPassword: "old passphrase value",
      newPassword: "a brand new passphrase",
    });
    expect(screen.getByTestId("change-done")).toBeTruthy();
    expect(sessionStore.get()).toBe("signed-in");
    expect(screen.getByLabelText("Current password").props.value).toBe("");
  });

  it("shows a wrong current password beside that field and the wait message after repeated failures", async () => {
    api.changePassword.mockRejectedValueOnce(
      appError("validation", {
        fields: [{ field: "currentPassword", message: "Incorrect password." }],
      }),
    );
    await open();
    await type("Current password", "wrong");
    await type("New password", "a brand new passphrase");
    await press("Change password");
    expect(screen.getByText("Incorrect password.")).toBeTruthy();
    expect(sessionStore.get()).toBe("signed-in");

    api.changePassword.mockRejectedValueOnce(appError("rate_limited", { retryAfter: 120 }));
    await press("Change password");
    expect(screen.getByTestId("form-error").props.accessibilityLabel).toMatch(
      /Please wait about 2 minutes/,
    );
  });

  it("shows new password rules beside the new password field", async () => {
    api.changePassword.mockRejectedValue(
      appError("validation", {
        fields: [{ field: "newPassword", message: "This password is too common." }],
      }),
    );
    await open();
    await type("Current password", "old passphrase value");
    await type("New password", "Password123");
    await press("Change password");
    expect(screen.getByText("This password is too common.")).toBeTruthy();
  });

  it("refreshes the sessions list afterwards so other devices disappear", async () => {
    api.changePassword.mockResolvedValue(undefined);
    api.listSessions
      .mockResolvedValueOnce([session("s1", true), session("s2", false)])
      .mockResolvedValue([session("s1", true)]);
    await renderRouter(app, { initialUrl: "/profile/sessions" });
    expect(await screen.findByTestId("session-s2")).toBeTruthy();
    await act(async () => router.push("/profile/change-password"));
    await type("Current password", "old passphrase value");
    await type("New password", "a brand new passphrase");
    await press("Change password");
    await act(async () => router.back());
    await waitFor(() => expect(screen.queryByTestId("session-s2")).toBeNull());
    expect(screen.getByTestId("session-s1")).toBeTruthy();
  });
});

describe("sessions", () => {
  beforeEach(() => {
    api.listSessions.mockResolvedValue([
      session("s1", true, "iOS 18"),
      session("s2", false, "Pixel 9"),
    ]);
  });

  it("lists sessions, marks this device and shows no secrets", async () => {
    await renderRouter(app, { initialUrl: "/profile/sessions" });
    expect(await screen.findByTestId("session-s1")).toBeTruthy();
    expect(screen.getByText("This device")).toBeTruthy();
    expect(screen.getByRole("button", { name: "End session on Pixel 9" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /End session on iOS 18/ })).toBeNull();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/refresh|accessToken/i);
  });

  it("ends another session only after confirming, naming the consequence", async () => {
    api.revokeSession.mockResolvedValue(undefined);
    await renderRouter(app, { initialUrl: "/profile/sessions" });
    await screen.findByTestId("session-s2");
    await press("End session on Pixel 9");
    expect(screen.getByText(/Pixel 9 will be signed out/, hidden)).toBeTruthy();
    expect(api.revokeSession).not.toHaveBeenCalled();
    api.listSessions.mockResolvedValue([session("s1", true, "iOS 18")]);
    await fireEvent.press(screen.getByRole("button", { name: "End session" }));
    expect(api.revokeSession).toHaveBeenCalledWith("s2");
    await waitFor(() => expect(screen.queryByTestId("session-s2")).toBeNull());
  });

  it("closes the confirmation with Cancel or back without acting", async () => {
    await renderRouter(app, { initialUrl: "/profile/sessions" });
    await screen.findByTestId("session-s2");
    await press("End session on Pixel 9");
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/will be signed out/, hidden)).toBeNull();
    await press("End session on Pixel 9");
    await pressBackInModal();
    expect(screen.queryByText(/will be signed out/, hidden)).toBeNull();
    expect(api.revokeSession).not.toHaveBeenCalled();
  });

  it("signs out everywhere after confirming and returns to welcome", async () => {
    api.logoutEverywhere.mockResolvedValue(undefined);
    await renderRouter(app, { initialUrl: "/profile/sessions" });
    await screen.findByTestId("session-s1");
    await press("Sign out of all devices");
    expect(screen.getByText(/Every device, including this one/, hidden)).toBeTruthy();
    expect(api.logoutEverywhere).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getAllByRole("button", { name: "Sign out of all devices", ...hidden }).at(-1)!,
    );
    expect(api.logoutEverywhere).toHaveBeenCalledTimes(1);
    expect(sessionStore.get()).toBe("signed-out");
    expect(secure.__dump()).toEqual({});
    expect(screen).toHavePathname("/sign-in");
  });
});

describe("delete account", () => {
  const openDialog = async () => {
    await renderRouter(app, { initialUrl: "/profile" });
    await screen.findByText("Ann");
    await press("Delete account");
  };

  it("explains what deletion does before asking for the password", async () => {
    await openDialog();
    expect(
      screen.getByText(
        /permanently removes your personal data and signs you out on every device/,
        hidden,
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Password", hidden)).toBeTruthy();
  });

  it("deletes with the right password, clears the device and shows welcome", async () => {
    api.deleteAccount.mockResolvedValue(undefined);
    await openDialog();
    await fireEvent.changeText(screen.getByLabelText("Password", hidden), "my passphrase value");
    await fireEvent.press(screen.getByRole("button", { name: "Delete my account", ...hidden }));
    expect(api.deleteAccount).toHaveBeenCalledWith({ password: "my passphrase value" });
    expect(sessionStore.get()).toBe("signed-out");
    expect(secure.__dump()).toEqual({});
    expect(sessionStore.getSnapshot().notice).toBe("Your account was deleted.");
  });

  it("keeps the account and shows the problem beside the field for a wrong password", async () => {
    api.deleteAccount.mockRejectedValue(
      appError("validation", { fields: [{ field: "password", message: "Incorrect password." }] }),
    );
    await openDialog();
    await fireEvent.changeText(screen.getByLabelText("Password", hidden), "wrong");
    await fireEvent.press(screen.getByRole("button", { name: "Delete my account", ...hidden }));
    expect(screen.getByText("Incorrect password.", hidden)).toBeTruthy();
    expect(sessionStore.get()).toBe("signed-in");
  });

  it("says plainly when the only Admin cannot delete their account", async () => {
    api.deleteAccount.mockRejectedValue(appError("conflict"));
    await openDialog();
    await fireEvent.changeText(screen.getByLabelText("Password", hidden), "my passphrase value");
    await fireEvent.press(screen.getByRole("button", { name: "Delete my account", ...hidden }));
    expect(screen.getByText(/only Admin/, hidden)).toBeTruthy();
    expect(sessionStore.get()).toBe("signed-in");
  });

  it("cancels without changes and returns focus to the delete control", async () => {
    const focusSpy = jest.spyOn(focus, "focusElement").mockImplementation(() => undefined);
    await openDialog();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel", ...hidden }));
    expect(api.deleteAccount).not.toHaveBeenCalled();
    expect(screen.queryByTestId("dialog", hidden)).toBeNull();
    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });
});

describe("sign out and tabs", () => {
  it("signs out, clears the device and lands on welcome", async () => {
    http.logout.mockResolvedValue(undefined);
    await renderRouter(app, { initialUrl: "/profile" });
    await screen.findByText("Ann");
    await press("Sign out");
    expect(sessionStore.get()).toBe("signed-out");
    expect(secure.__dump()).toEqual({});
    expect(screen).toHavePathname("/sign-in");
  });

  it("explains an offline sign out honestly", async () => {
    http.logout.mockRejectedValue(appError("network"));
    await renderRouter(app, { initialUrl: "/profile" });
    await screen.findByText("Ann");
    await press("Sign out");
    expect(sessionStore.getSnapshot().notice).toMatch(/could not reach the server/);
  });

  it("keeps the Profile tab's place when switching tabs", async () => {
    api.listSessions.mockResolvedValue([session("s1", true)]);
    const view = await renderRouter(app, { initialUrl: "/profile/sessions" });
    await view.findByTestId("session-s1");
    const { result } = await renderHook(() => useNavigationContainerRef());
    const jump = (name: string) =>
      act(async () => result.current.dispatch({ type: "JUMP_TO", payload: { name } } as never));
    await jump("home");
    expect(view).toHavePathname("/home");
    await jump("profile");
    expect(view).toHavePathname("/profile/sessions");
  });
});

describe("secrets stay out of logs in the signed-in area", () => {
  it("writes no password or token to the console across management flows, successes and failures", async () => {
    const spy = spyOnConsole();
    const secret = "Super-Secret-Passphrase-42";
    api.changePassword.mockRejectedValueOnce(
      appError("validation", {
        fields: [{ field: "currentPassword", message: "Incorrect password." }],
      }),
    );
    api.deleteAccount.mockRejectedValueOnce(appError("network"));
    await renderRouter(app, { initialUrl: "/profile/change-password" });
    await type("Current password", secret);
    await type("New password", `${secret}-new`);
    await press("Change password");
    await act(async () => router.replace("/profile"));
    await screen.findByText("Ann");
    await press("Delete account");
    await fireEvent.changeText(screen.getByLabelText("Password", hidden), secret);
    await fireEvent.press(screen.getByRole("button", { name: "Delete my account", ...hidden }));
    http.logout.mockRejectedValue(appError("network"));
    await fireEvent.press(screen.getByRole("button", { name: "Cancel", ...hidden }));
    await press("Sign out");
    const text = spy.text();
    spy.restore();
    for (const s of [secret, `${secret}-new`, pair().accessToken, pair().refreshToken]) {
      expect(text.includes(s)).toBe(false);
    }
  });
});
