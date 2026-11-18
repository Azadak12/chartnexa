import * as SecureStore from "expo-secure-store";
import { accountApi } from "../src/auth/account-api";
import { authHttp } from "../src/auth/auth-http";
import { authedFetch } from "../src/auth/authed-fetch";
import { sessionManager } from "../src/auth/session-manager";
import { AppError } from "../src/api/errors";
import { sessionStore } from "../src/session/session-store";
import { GOOD_PASSWORD, realFetch, uniqueEmail, waitForToken } from "./helpers";

const secure = SecureStore as unknown as {
  __reset: () => void;
  __dump: () => Record<string, string>;
};

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_BASE_URL = process.env.CONTRACT_API_URL;
  (globalThis as { fetch: unknown }).fetch = realFetch;
});
beforeEach(() => {
  secure.__reset();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
});
afterEach(() => sessionManager._resetForTests());

async function newAccount(verify = true) {
  const email = uniqueEmail();
  await authHttp.register({ email, password: GOOD_PASSWORD });
  if (verify) await authHttp.verifyEmail(await waitForToken(email, "Verify your ChartNexa email"));
  return email;
}

const failure = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error("expected a failure");
};

describe("account access against the real API", () => {
  it("registers, verifies from the emailed code and refuses the code a second time", async () => {
    const email = uniqueEmail();
    await authHttp.register({ email, password: GOOD_PASSWORD });
    const token = await waitForToken(email, "Verify your ChartNexa email");
    await authHttp.verifyEmail(token);
    const again = await failure(authHttp.verifyEmail(token));
    expect(again.kind).toBe("validation");
    expect(again.fields).toEqual([]);
  });

  it("answers registration the same way for an existing email", async () => {
    const email = await newAccount();
    await expect(authHttp.register({ email, password: GOOD_PASSWORD })).resolves.toBeUndefined();
  });

  it("shows server password rules as field errors", async () => {
    const e = await failure(authHttp.register({ email: uniqueEmail(), password: "Password123" }));
    expect(e.kind).toBe("validation");
    expect(e.fields.some((f) => f.field === "password")).toBe(true);
  });

  it("signs in, stores only the refresh token and reads the account", async () => {
    const email = await newAccount();
    const pair = await authHttp.login({ email, password: GOOD_PASSWORD });
    await sessionManager.signIn(pair);
    expect(Object.keys(secure.__dump())).toEqual(["chartnexa.session.v1"]);
    expect(secure.__dump()["chartnexa.session.v1"]).not.toContain(pair.accessToken);
    const me = await accountApi.me();
    expect(me).toMatchObject({ email, emailVerified: true });
  });

  it("gives one identical error for a wrong password and an unknown email", async () => {
    const email = await newAccount();
    const wrong = await failure(authHttp.login({ email, password: "wrong password value" }));
    const unknown = await failure(
      authHttp.login({ email: uniqueEmail(), password: "wrong password value" }),
    );
    expect(wrong.kind).toBe("unauthorized");
    expect(unknown.kind).toBe("unauthorized");
    expect(wrong.message).toBe(unknown.message);
    expect(wrong.requestId).toBeTruthy();
  });

  it("slows down repeated failures with a wait", async () => {
    const email = await newAccount();
    let last: AppError | null = null;
    // Counters use fixed time windows, so on a slow machine the attempts can straddle two
    // windows. Keep failing (up to 15 times) until the wait appears.
    for (let i = 0; i < 15 && last?.kind !== "rate_limited"; i++)
      last = await failure(authHttp.login({ email, password: "wrong password value" }));
    expect(last?.kind).toBe("rate_limited");
    expect(last?.retryAfterSeconds).toBeGreaterThan(0);
    expect(last?.message).toMatch(/wait about/);
  });
});

describe("sessions against the real API", () => {
  it("rotates the refresh token on renewal and ends the session if an old one is replayed", async () => {
    const email = await newAccount();
    const first = await authHttp.login({ email, password: GOOD_PASSWORD });
    await sessionManager.signIn(first);
    expect(await sessionManager.renew()).toBe("ok");
    expect((await accountApi.me()).email).toBe(email);

    // Replaying the first (now rotated) refresh token is treated as theft by the server.
    const replay = await failure(authHttp.refresh(first.refreshToken));
    expect(replay.kind).toBe("unauthorized");
    // The legitimate holder's session is now revoked too, and the app notices at its next request.
    await failure(authedFetch("/me"));
    expect(sessionStore.get()).toBe("signed-out");
    expect(secure.__dump()).toEqual({});
  });

  it("renews once and repeats the request after a 401", async () => {
    const email = await newAccount();
    await sessionManager.signIn(await authHttp.login({ email, password: GOOD_PASSWORD }));
    sessionManager._setAccessTokenForTests("not-a-valid-token", 600_000);
    const me = await accountApi.me();
    expect(me.email).toBe(email);
    expect(sessionStore.get()).toBe("signed-in");
  });

  it("restores a stored session at launch and rejects it after sign out", async () => {
    const email = await newAccount();
    await sessionManager.signIn(await authHttp.login({ email, password: GOOD_PASSWORD }));
    const stored = secure.__dump()["chartnexa.session.v1"] as string;

    sessionManager._resetForTests();
    sessionStore.set("restoring");
    await sessionManager.restore();
    expect(sessionStore.get()).toBe("signed-in");
    expect((await accountApi.me()).email).toBe(email);

    await sessionManager.signOut();
    secure.__reset();
    await SecureStore.setItemAsync("chartnexa.session.v1", stored);
    sessionManager._resetForTests();
    sessionStore.set("restoring");
    await sessionManager.restore();
    expect(sessionStore.get()).toBe("signed-out");
  });

  it("lists sessions, marks this device and ends another", async () => {
    const email = await newAccount();
    const other = await authHttp.login({ email, password: GOOD_PASSWORD });
    await sessionManager.signIn(await authHttp.login({ email, password: GOOD_PASSWORD }));
    const list = await accountApi.listSessions();
    expect(list).toHaveLength(2);
    expect(list.filter((s) => s.current)).toHaveLength(1);
    expect(list.every((s) => typeof s.deviceLabel === "string" || s.deviceLabel === null)).toBe(
      true,
    );
    await accountApi.revokeSession(other.sessionId);
    expect(await accountApi.listSessions()).toHaveLength(1);
    expect((await failure(authHttp.refresh(other.refreshToken))).kind).toBe("unauthorized");
  });
});

describe("account management against the real API", () => {
  it("changes the password: a wrong current password is a field error that keeps the session, success ends other sessions", async () => {
    const email = await newAccount();
    const other = await authHttp.login({ email, password: GOOD_PASSWORD });
    await sessionManager.signIn(await authHttp.login({ email, password: GOOD_PASSWORD }));

    const wrong = await failure(
      accountApi.changePassword({
        currentPassword: "not my password",
        newPassword: "a brand new passphrase",
      }),
    );
    expect(wrong.kind).toBe("validation");
    expect(wrong.fields.map((f) => f.field)).toEqual(["currentPassword"]);
    expect(sessionStore.get()).toBe("signed-in");

    await accountApi.changePassword({
      currentPassword: GOOD_PASSWORD,
      newPassword: "a brand new passphrase",
    });
    expect(sessionStore.get()).toBe("signed-in");
    expect(await accountApi.listSessions()).toHaveLength(1);
    expect((await failure(authHttp.refresh(other.refreshToken))).kind).toBe("unauthorized");
    await expect(
      authHttp.login({ email, password: "a brand new passphrase" }),
    ).resolves.toBeTruthy();
  });

  it("updates the display name", async () => {
    const email = await newAccount();
    await sessionManager.signIn(await authHttp.login({ email, password: GOOD_PASSWORD }));
    const me = await accountApi.updateProfile({ displayName: "Ann Contract" });
    expect(me.displayName).toBe("Ann Contract");
  });

  it("signs out everywhere", async () => {
    const email = await newAccount();
    const other = await authHttp.login({ email, password: GOOD_PASSWORD });
    await sessionManager.signIn(await authHttp.login({ email, password: GOOD_PASSWORD }));
    await accountApi.logoutEverywhere();
    expect((await failure(authHttp.refresh(other.refreshToken))).kind).toBe("unauthorized");
  });

  it("deletes the account only with the right password, and the session survives a wrong one", async () => {
    const email = await newAccount();
    await sessionManager.signIn(await authHttp.login({ email, password: GOOD_PASSWORD }));
    const wrong = await failure(accountApi.deleteAccount({ password: "not my password" }));
    expect(wrong.fields.map((f) => f.field)).toEqual(["password"]);
    expect(sessionStore.get()).toBe("signed-in");

    await accountApi.deleteAccount({ password: GOOD_PASSWORD });
    await sessionManager.clearAfterServerEnd("Your account was deleted.");
    expect((await failure(authHttp.login({ email, password: GOOD_PASSWORD }))).kind).toBe(
      "unauthorized",
    );
  });

  it("resends the verification email for an unverified account", async () => {
    const email = await newAccount(false);
    await sessionManager.signIn(await authHttp.login({ email, password: GOOD_PASSWORD }));
    expect((await accountApi.me()).emailVerified).toBe(false);
    await accountApi.resendVerification();
    const token = await waitForToken(email, "Verify your ChartNexa email");
    await authHttp.verifyEmail(token);
    expect((await accountApi.me()).emailVerified).toBe(true);
  });
});

describe("password recovery against the real API", () => {
  it("resets from the emailed code, rejects a weak password without using the code, and ends sessions", async () => {
    const email = await newAccount();
    const old = await authHttp.login({ email, password: GOOD_PASSWORD });
    await authHttp.forgotPassword({ email });
    const token = await waitForToken(email, "Reset your ChartNexa password");

    const weak = await failure(authHttp.resetPassword({ token, newPassword: "Password123" }));
    expect(weak.fields.map((f) => f.field)).toEqual(["newPassword"]);

    await authHttp.resetPassword({ token, newPassword: "a brand new passphrase" });
    expect((await failure(authHttp.refresh(old.refreshToken))).kind).toBe("unauthorized");
    await expect(
      authHttp.login({ email, password: "a brand new passphrase" }),
    ).resolves.toBeTruthy();

    const reused = await failure(
      authHttp.resetPassword({ token, newPassword: "yet another passphrase" }),
    );
    expect(reused.kind).toBe("validation");
    expect(reused.fields).toEqual([]);
  });

  it("answers forgot-password the same for an unknown email", async () => {
    await expect(authHttp.forgotPassword({ email: uniqueEmail() })).resolves.toBeUndefined();
  });
});
