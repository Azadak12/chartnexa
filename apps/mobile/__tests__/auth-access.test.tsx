import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { appError, pair, spyOnConsole } from "../test-utils/auth-mocks";

jest.mock("../src/auth/auth-http", () => ({
  authHttp: {
    login: jest.fn(),
    register: jest.fn(),
    refresh: jest.fn(),
    verifyEmail: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    logout: jest.fn(),
  },
}));
jest.mock("../src/reviews/review-api", () => ({
  reviewsApi: {
    list: jest.fn(async () => ({ items: [], nextCursor: null })),
    mine: jest.fn(async () => ({ review: null })),
    write: jest.fn(),
    remove: jest.fn(),
  },
}));
jest.mock("../src/auth/account-api", () => ({
  accountApi: {
    me: jest.fn().mockResolvedValue({
      id: "u1",
      email: "a@b.co",
      displayName: null,
      emailVerified: true,
      createdAt: "2026-11-17T00:00:00.000Z",
    }),
    resendVerification: jest.fn(),
  },
}));

const http = authHttp as unknown as Record<keyof typeof authHttp, jest.Mock>;
const secure = SecureStore as unknown as { __reset: () => void };

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: {
    list: jest.fn(async () => ({ items: [], nextCursor: null })),
    get: jest.fn(async (id: string) => ({
      id,
      title: `Course ${id}`,
      description: "About this course",
      level: "beginner",
      priceCents: 4900,
      currency: "USD",
      coverTone: "blue",
      publishedAt: "2026-11-17T00:00:00.000Z",
    })),
  },
}));

const app = "./app";

const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(() => {
  jest.clearAllMocks();
  secure.__reset();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  sessionStore.setNotice(null);
});

describe("sign in", () => {
  it("signs in and goes Home", async () => {
    http.login.mockResolvedValue(pair());
    await renderRouter(app, { initialUrl: "/sign-in" });
    await type("Email", "ann@example.com");
    await type("Password", "correct horse battery");
    await press("Sign in");
    expect(http.login).toHaveBeenCalledWith({
      email: "ann@example.com",
      password: "correct horse battery",
    });
    expect(sessionStore.get()).toBe("signed-in");
    expect(screen).toHavePathname("/home");
  });

  it("goes to the remembered destination", async () => {
    http.login.mockResolvedValue(pair());
    await renderRouter(app, { initialUrl: "/sign-in?returnTo=%2Fcourse%2F4" });
    await type("Email", "ann@example.com");
    await type("Password", "correct horse battery");
    await press("Sign in");
    expect(screen).toHavePathname("/course/4");
  });

  it("shows one message for a wrong password or unknown email and clears the password", async () => {
    http.login.mockRejectedValue(appError("unauthorized"));
    await renderRouter(app, { initialUrl: "/sign-in" });
    await type("Email", "ann@example.com");
    await type("Password", "wrong password value");
    await press("Sign in");
    expect(screen.getByTestId("form-error").props.accessibilityLabel).toBe(
      "Error: Invalid email or password.",
    );
    expect(screen.getByLabelText("Password").props.value).toBe("");
    expect(sessionStore.get()).toBe("signed-out");
  });

  it("explains too many attempts with the wait and keeps the button off until it passes", async () => {
    http.login.mockRejectedValue(appError("rate_limited", { retryAfter: 30 }));
    await renderRouter(app, { initialUrl: "/sign-in" });
    await type("Email", "ann@example.com");
    await type("Password", "whatever password");
    await press("Sign in");
    expect(screen.getByTestId("form-error").props.accessibilityLabel).toMatch(
      /wait about 30 seconds/,
    );
    expect(screen.getByRole("button", { name: "Sign in" }).props.accessibilityState.disabled).toBe(
      true,
    );
    http.login.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(http.login).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(31_000));
    expect(screen.getByRole("button", { name: "Sign in" }).props.accessibilityState.disabled).toBe(
      false,
    );
  });

  it("says when there is no connection, differently from a wrong password", async () => {
    http.login.mockRejectedValue(appError("network"));
    await renderRouter(app, { initialUrl: "/sign-in" });
    await type("Email", "ann@example.com");
    await type("Password", "whatever password");
    await press("Sign in");
    const text = screen.getByTestId("form-error").props.accessibilityLabel as string;
    expect(text).toMatch(/offline|reach the server/i);
    expect(text).not.toMatch(/Invalid email or password/);
  });

  it("sends one request when the button is pressed twice quickly", async () => {
    let finish!: () => void;
    http.login.mockImplementation(() => new Promise((r) => (finish = () => r(pair()))));
    await renderRouter(app, { initialUrl: "/sign-in" });
    await type("Email", "ann@example.com");
    await type("Password", "correct horse battery");
    const b = screen.getByRole("button", { name: "Sign in" });
    await fireEvent.press(b);
    await fireEvent.press(b);
    expect(http.login).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it("validates before sending and focuses the problem", async () => {
    await renderRouter(app, { initialUrl: "/sign-in" });
    await press("Sign in");
    expect(http.login).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("field-error").length).toBeGreaterThan(0);
  });

  it("declares autofill and keyboard hints for the email and password fields", async () => {
    await renderRouter(app, { initialUrl: "/sign-in" });
    const email = screen.getByLabelText("Email");
    expect(email.props.keyboardType).toBe("email-address");
    expect(email.props.autoComplete).toBe("email");
    expect(email.props.autoCapitalize).toBe("none");
    const pw = screen.getByLabelText("Password");
    expect(pw.props.autoComplete).toBe("current-password");
    expect(pw.props.textContentType).toBe("password");
    expect(pw.props.autoCorrect).toBe(false);
    expect(pw.props.secureTextEntry).toBe(true);
  });

  it("shows and hides the password with a labelled control and masks it again when the screen is left", async () => {
    await renderRouter(app, { initialUrl: "/sign-in" });
    await press("Show password");
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);
    expect(screen.getByRole("button", { name: "Hide password" })).toBeTruthy();
    await act(async () => router.push("/forgot-password"));
    await act(async () => router.back());
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
    expect(screen.getByRole("button", { name: "Show password" })).toBeTruthy();
  });

  it("shows the reason a previous session ended", async () => {
    sessionStore.setNotice("Your session ended. Please sign in again.");
    await renderRouter(app, { initialUrl: "/sign-in" });
    expect(screen.getByTestId("session-notice")).toBeTruthy();
  });
});

describe("create account", () => {
  it("shows the same confirmation and does not sign the person in", async () => {
    http.register.mockResolvedValue(undefined);
    await renderRouter(app, { initialUrl: "/register" });
    await type("Email", "new@example.com");
    await type("Password", "correct horse battery");
    await type("Confirm password", "correct horse battery");
    await press("Sign up");
    expect(http.register).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "correct horse battery",
    });
    expect(screen.getByTestId("register-done")).toBeTruthy();
    expect(screen.getByText("Check your email")).toBeTruthy();
    expect(sessionStore.get()).toBe("signed-out");
    expect(http.login).not.toHaveBeenCalled();
  });

  it("sends the optional name only when given", async () => {
    http.register.mockResolvedValue(undefined);
    await renderRouter(app, { initialUrl: "/register" });
    await type("Name (optional)", "Ann");
    await type("Email", "new@example.com");
    await type("Password", "correct horse battery");
    await type("Confirm password", "correct horse battery");
    await press("Sign up");
    expect(http.register).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "correct horse battery",
      displayName: "Ann",
    });
  });

  it("shows server password rules beside the field and keeps what was typed", async () => {
    http.register.mockRejectedValue(
      appError("validation", {
        fields: [{ field: "password", message: "This password is too common." }],
      }),
    );
    await renderRouter(app, { initialUrl: "/register" });
    await type("Email", "new@example.com");
    await type("Password", "Password123");
    await type("Confirm password", "Password123");
    await press("Sign up");
    expect(screen.getByText("This password is too common.")).toBeTruthy();
    expect(screen.getByLabelText("Email").props.value).toBe("new@example.com");
    expect(screen.getByLabelText("Password").props.accessibilityHint).toBe(
      "Error: This password is too common.",
    );
  });

  it("asks for the password twice and does not submit when they differ", async () => {
    await renderRouter(app, { initialUrl: "/register" });
    await type("Email", "new@example.com");
    await type("Password", "correct horse battery");
    await press("Sign up");
    expect(await screen.findByText("Enter the password again")).toBeTruthy();
    await type("Confirm password", "correct horse batter");
    await press("Sign up");
    expect(await screen.findByText("The passwords do not match")).toBeTruthy();
    expect(http.register).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Email").props.value).toBe("new@example.com");
  });

  it("uses a new-password autofill hint", async () => {
    await renderRouter(app, { initialUrl: "/register" });
    const pw = screen.getByLabelText("Password");
    expect(pw.props.autoComplete).toBe("new-password");
    expect(pw.props.textContentType).toBe("newPassword");
  });
});

describe("forgot and reset password", () => {
  it("shows the same confirmation for any email", async () => {
    http.forgotPassword.mockResolvedValue(undefined);
    await renderRouter(app, { initialUrl: "/forgot-password" });
    await type("Email", "anyone@example.com");
    await press("Send reset link");
    expect(screen.getByTestId("forgot-done")).toBeTruthy();
    expect(http.forgotPassword).toHaveBeenCalledWith({ email: "anyone@example.com" });
  });

  it("resets from the link, then sends the person to sign in with a notice", async () => {
    http.resetPassword.mockResolvedValue(undefined);
    await renderRouter(app, {
      initialUrl: "/reset-password?token=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
    });
    expect(screen.getByLabelText("Code from your email").props.value).toBe(
      "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
    );
    await type("New password", "a brand new passphrase");
    await press("Change password");
    expect(http.resetPassword).toHaveBeenCalledWith({
      token: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
      newPassword: "a brand new passphrase",
    });
    expect(screen).toHavePathname("/sign-in");
    expect(screen.getByTestId("session-notice")).toBeTruthy();
  });

  it("accepts a pasted code", async () => {
    http.resetPassword.mockResolvedValue(undefined);
    await renderRouter(app, { initialUrl: "/reset-password" });
    await type("Code from your email", "pasted-code-value-1234567890");
    await type("New password", "a brand new passphrase");
    await press("Change password");
    expect(http.resetPassword).toHaveBeenCalledWith({
      token: "pasted-code-value-1234567890",
      newPassword: "a brand new passphrase",
    });
  });

  it("shows a weak password beside the field without treating the code as bad", async () => {
    http.resetPassword.mockRejectedValue(
      appError("validation", {
        fields: [{ field: "newPassword", message: "This password is too common." }],
      }),
    );
    await renderRouter(app, {
      initialUrl: "/reset-password?token=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
    });
    await type("New password", "Password123");
    await press("Change password");
    expect(screen.getByText("This password is too common.")).toBeTruthy();
    expect(screen.queryByTestId("bad-code")).toBeNull();
    expect(screen).toHavePathname("/reset-password");
  });

  it("shows one generic message for a bad, used or expired code, with a way to ask again", async () => {
    http.resetPassword.mockRejectedValue(appError("validation"));
    await renderRouter(app, {
      initialUrl: "/reset-password?token=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
    });
    await type("New password", "a brand new passphrase");
    await press("Change password");
    expect(screen.getByTestId("bad-code").props.accessibilityLabel).toBe(
      "Error: This code is invalid or has expired.",
    );
    await press("Request a new reset email");
    expect(screen).toHavePathname("/forgot-password");
  });
});

describe("verify email", () => {
  const link = "/verify-email?token=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

  it("verifies from the link and offers sign in", async () => {
    http.verifyEmail.mockResolvedValue(undefined);
    await renderRouter(app, { initialUrl: link });
    expect(http.verifyEmail).toHaveBeenCalledWith("abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG");
    expect(screen.getByTestId("verify-done")).toBeTruthy();
    await press("Sign in");
    expect(screen).toHavePathname("/sign-in");
  });

  it("offers Continue when already signed in", async () => {
    http.verifyEmail.mockResolvedValue(undefined);
    await sessionManager.signIn(pair());
    await renderRouter(app, { initialUrl: link });
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("verifies a pasted code", async () => {
    http.verifyEmail.mockResolvedValue(undefined);
    await renderRouter(app, { initialUrl: "/verify-email" });
    await type("Code from your email", "pasted-code-value-1234567890");
    await press("Verify email");
    expect(http.verifyEmail).toHaveBeenCalledWith("pasted-code-value-1234567890");
    expect(screen.getByTestId("verify-done")).toBeTruthy();
  });

  it("shows one generic message for a bad code and, signed in, offers a new email once", async () => {
    http.verifyEmail.mockRejectedValue(appError("validation"));
    await sessionManager.signIn(pair());
    const { accountApi } = jest.requireMock("../src/auth/account-api") as {
      accountApi: { resendVerification: jest.Mock };
    };
    accountApi.resendVerification.mockResolvedValue(undefined);
    await renderRouter(app, { initialUrl: link });
    expect(screen.getByTestId("bad-code").props.accessibilityLabel).toBe(
      "Error: This code is invalid or has expired.",
    );
    await press("Send me a new email");
    await press("Email sent").catch(() => undefined);
    expect(accountApi.resendVerification).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Email sent" }).props.accessibilityState.disabled,
    ).toBe(true);
  });

  it("tells a signed-out person to sign in to request a new email", async () => {
    http.verifyEmail.mockRejectedValue(appError("validation"));
    await renderRouter(app, { initialUrl: link });
    expect(screen.getByText(/Sign in, then request a new verification email/)).toBeTruthy();
  });
});

describe("public screens while signed in", () => {
  it("send a signed-in person Home, except the two link screens", async () => {
    await sessionManager.signIn(pair());
    await renderRouter(app, { initialUrl: "/register" });
    expect(screen).toHavePathname("/home");
    await act(async () => router.navigate("/forgot-password"));
    expect(screen).toHavePathname("/home");
    await act(async () => router.navigate("/verify-email"));
    expect(screen).toHavePathname("/verify-email");
    await act(async () => router.navigate("/reset-password"));
    expect(screen).toHavePathname("/reset-password");
  });

  it("show every public screen to a signed-out person", async () => {
    for (const path of ["/welcome", "/sign-in", "/register", "/forgot-password"]) {
      await renderRouter(app, { initialUrl: path });
      expect(screen).toHavePathname(path);
    }
  });
});

describe("secrets stay out of logs", () => {
  it("writes no password, code or token to the console across success and failure", async () => {
    const spy = spyOnConsole();
    const password = "Very-Secret-Passphrase-123";
    const code = "very-secret-code-abcdefghijklmnopqrstuvwxyz";
    http.login.mockRejectedValueOnce(appError("unauthorized")).mockResolvedValueOnce(pair(7));
    http.resetPassword.mockRejectedValue(appError("validation"));
    http.verifyEmail.mockRejectedValue(appError("network"));
    await renderRouter(app, { initialUrl: "/sign-in" });
    await type("Email", "ann@example.com");
    await type("Password", password);
    await press("Sign in");
    await type("Password", password);
    await press("Sign in");
    await act(async () => sessionStore.set("signed-out"));
    await renderRouter(app, { initialUrl: `/reset-password?token=${code}` });
    await type("New password", password);
    await press("Change password");
    await renderRouter(app, { initialUrl: `/verify-email?token=${code}` });
    const text = spy.text();
    spy.restore();
    for (const secret of [password, code, pair(7).accessToken, pair(7).refreshToken]) {
      expect(text.includes(secret)).toBe(false);
    }
  });
});
