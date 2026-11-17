import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { authedFetch } from "../src/auth/authed-fetch";
import { RENEW_BEFORE_MS, sessionManager } from "../src/auth/session-manager";
import { tokenStore } from "../src/auth/token-store";
import { sessionStore } from "../src/session/session-store";
import { FakeApi } from "../test-utils/fake-api";

const secure = SecureStore as unknown as {
  __dump: () => Record<string, string>;
  __reset: () => void;
  __failWrites: (v: boolean) => void;
};
const netinfo = jest.requireMock("@react-native-community/netinfo") as {
  __setConnected: (v: boolean) => void;
};

let api: FakeApi;
afterEach(() => {
  // Stop background retry timers so they cannot keep the test process alive.
  sessionManager._resetForTests();
  jest.useRealTimers();
});

beforeEach(() => {
  jest.useRealTimers();
  secure.__reset();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  sessionStore.setNotice(null);
  api = new FakeApi();
  api.install();
  (SecureStore.setItemAsync as jest.Mock).mockClear();
});

const stored = () => secure.__dump()["chartnexa.session.v1"];

describe("storage", () => {
  it("stores only the refresh token and session id after sign in; the access token stays in memory", async () => {
    const pair = api.newSession();
    await sessionManager.signIn(pair);
    expect(Object.keys(secure.__dump())).toEqual(["chartnexa.session.v1"]);
    expect(stored()).not.toContain(pair.accessToken);
    expect(JSON.parse(stored() as string)).toEqual({
      refreshToken: pair.refreshToken,
      sessionId: pair.sessionId,
    });
    expect(sessionStore.get()).toBe("signed-in");
    expect(sessionManager.currentAccessToken()).toBe(pair.accessToken);
  });

  it("deletes the stored token and clears memory on sign out", async () => {
    await sessionManager.signIn(api.newSession());
    await sessionManager.signOut();
    expect(secure.__dump()).toEqual({});
    expect(sessionManager.currentAccessToken()).toBeNull();
    expect(sessionManager.hasSession()).toBe(false);
    expect(sessionStore.get()).toBe("signed-out");
  });
});

describe("restore at launch", () => {
  const launch = async () => {
    sessionManager._resetForTests();
    sessionStore.set("restoring");
    await sessionManager.restore();
  };

  it("signs in without a prompt when the stored session is still valid", async () => {
    const pair = api.newSession();
    await tokenStore.save({ refreshToken: pair.refreshToken, sessionId: pair.sessionId });
    await launch();
    expect(sessionStore.get()).toBe("signed-in");
    expect(sessionManager.currentAccessToken()).not.toBeNull();
    // The rotated refresh token replaced the old one in secure storage.
    expect(stored()).not.toContain(pair.refreshToken);
  });

  it("shows welcome and removes the stored token when nothing is stored or the server rejects it", async () => {
    await launch();
    expect(sessionStore.get()).toBe("signed-out");

    await tokenStore.save({ refreshToken: "r".repeat(32), sessionId: "unknown" });
    await launch();
    expect(sessionStore.get()).toBe("signed-out");
    expect(secure.__dump()).toEqual({});
  });

  it("never reports signed-out while still restoring", async () => {
    const pair = api.newSession();
    await tokenStore.save({ refreshToken: pair.refreshToken, sessionId: pair.sessionId });
    sessionManager._resetForTests();
    sessionStore.set("restoring");
    const seen: string[] = [];
    const off = sessionStore.subscribe(() => seen.push(sessionStore.get()));
    await sessionManager.restore();
    off();
    expect(seen).not.toContain("signed-out");
    expect(seen.at(-1)).toBe("signed-in");
  });

  it("stays signed in when offline at launch, keeps the token and renews once the connection returns", async () => {
    jest.useFakeTimers();
    const pair = api.newSession();
    await tokenStore.save({ refreshToken: pair.refreshToken, sessionId: pair.sessionId });
    api.offline = true;
    await launch();
    expect(sessionStore.get()).toBe("signed-in");
    expect(sessionManager.currentAccessToken()).toBeNull();
    expect(stored()).toContain(pair.refreshToken);

    api.offline = false;
    await jest.advanceTimersByTimeAsync(5_000);
    expect(sessionManager.currentAccessToken()).not.toBeNull();
    expect(sessionStore.get()).toBe("signed-in");
  });

  it("renews when the network comes back, without waiting for the timer", async () => {
    const pair = api.newSession();
    await tokenStore.save({ refreshToken: pair.refreshToken, sessionId: pair.sessionId });
    api.offline = true;
    await launch();
    api.offline = false;
    netinfo.__setConnected(true);
    for (let i = 0; i < 50 && !sessionManager.currentAccessToken(); i++)
      await new Promise((r) => setTimeout(r, 5));
    expect(sessionManager.currentAccessToken()).not.toBeNull();
  });
});

describe("renewal", () => {
  it("makes exactly one renewal call when many requests need a new token at once", async () => {
    api.expiresIn = 30; // under the renew-before window, so every caller wants a renewal
    const pair = api.newSession();
    await sessionManager.signIn(pair);
    api.refreshCalls.length = 0;
    const tokens = await Promise.all(
      Array.from({ length: 8 }, () => sessionManager.getAccessToken()),
    );
    expect(api.refreshCalls).toHaveLength(1);
    expect(new Set(tokens).size).toBe(1);
    expect(tokens[0]).not.toBeNull();
  });

  it("saves the new refresh token before any request uses the new access token", async () => {
    api.expiresIn = 30;
    await sessionManager.signIn(api.newSession());
    const events: string[] = [];
    (SecureStore.setItemAsync as jest.Mock).mockImplementationOnce(async () => {
      events.push("saved");
    });
    const real = api.fetch;
    (globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init: never) => {
      if (String(url).endsWith("/me")) events.push("used");
      return real(url, init);
    });
    await authedFetch("/me");
    expect(events).toEqual(["saved", "used"]);
  });

  it("never sends a refresh token twice across many renewals, and the session survives", async () => {
    await sessionManager.signIn(api.newSession());
    for (let i = 0; i < 6; i++) {
      api.expireAccessTokens();
      expect(await sessionManager.renew()).toBe("ok");
    }
    expect(new Set(api.refreshCalls).size).toBe(api.refreshCalls.length);
    expect([...api.sessions.values()].every((s) => !s.revoked)).toBe(true);
    expect(sessionStore.get()).toBe("signed-in");
  });

  it("renews proactively when little time is left and when the app returns to the foreground", async () => {
    api.expiresIn = Math.floor(RENEW_BEFORE_MS / 1000) - 5;
    const pair = api.newSession();
    await sessionManager.signIn(pair);
    api.refreshCalls.length = 0;
    await sessionManager.getAccessToken();
    expect(api.refreshCalls).toHaveLength(1);

    api.refreshCalls.length = 0;
    const listener = (AppState.addEventListener as jest.Mock | undefined)?.mock;
    expect(listener === undefined || true).toBe(true);
    // Simulate the foreground event through React Native's AppState mock.
    (AppState as unknown as { currentState: string }).currentState = "active";
    const handlers: Array<(s: string) => void> = [];
    jest.spyOn(AppState, "addEventListener").mockImplementation(((
      _e: string,
      h: (s: string) => void,
    ) => {
      handlers.push(h);
      return { remove: () => undefined };
    }) as never);
    sessionManager._resetForTests();
    await sessionManager.signIn(api.newSession());
    api.refreshCalls.length = 0;
    handlers.forEach((h) => h("active"));
    await new Promise((r) => setTimeout(r, 0));
    expect(api.refreshCalls.length).toBeGreaterThanOrEqual(1);
    jest.restoreAllMocks();
  });

  it("keeps the new token in memory when secure storage fails, and uses it (not the old one) next time", async () => {
    await sessionManager.signIn(api.newSession());
    secure.__failWrites(true);
    api.expireAccessTokens();
    expect(await sessionManager.renew()).toBe("ok");
    api.expireAccessTokens();
    expect(await sessionManager.renew()).toBe("ok"); // would be 'ended' had the old token been reused
    expect(new Set(api.refreshCalls).size).toBe(api.refreshCalls.length);
    expect([...api.sessions.values()].every((s) => !s.revoked)).toBe(true);
  });
});

describe("requests after a 401", () => {
  it("renews once and repeats the request once", async () => {
    await sessionManager.signIn(api.newSession());
    api.expireAccessTokens(); // the server no longer accepts the token we hold
    api.refreshCalls.length = 0;
    const me = await authedFetch<{ id: string }>("/me");
    expect(me.id).toBe("u1");
    expect(api.refreshCalls).toHaveLength(1);
    expect(api.calls.filter((c) => c.path === "/me")).toHaveLength(2);
  });

  it("ends the session instead of looping when the repeat also returns 401", async () => {
    await sessionManager.signIn(api.newSession());
    api.forced.set("/me", 401);
    await expect(authedFetch("/me")).rejects.toMatchObject({ kind: "unauthorized" });
    expect(api.calls.filter((c) => c.path === "/me")).toHaveLength(2);
    expect(sessionStore.get()).toBe("signed-out");
    expect(secure.__dump()).toEqual({});
  });
});

describe("failure classes", () => {
  it("signs out with a notice and clears storage when renewal is rejected (for example revoked elsewhere)", async () => {
    const pair = api.newSession();
    await sessionManager.signIn(pair);
    api.sessions.get(pair.sessionId)!.revoked = true;
    api.expireAccessTokens();
    await expect(authedFetch("/me")).rejects.toMatchObject({ kind: "unauthorized" });
    expect(sessionStore.get()).toBe("signed-out");
    expect(sessionStore.getSnapshot().notice).toMatch(/session ended/i);
    expect(secure.__dump()).toEqual({});
  });

  it.each([
    ["offline", () => (api.offline = true)],
    ["server error", () => api.forced.set("/auth/refresh", 500)],
    ["too many requests", () => api.forced.set("/auth/refresh", 429)],
    ["service unavailable", () => api.forced.set("/auth/refresh", 503)],
  ])("keeps the session when renewal fails because of %s", async (_name, breakIt) => {
    await sessionManager.signIn(api.newSession());
    api.expireAccessTokens();
    breakIt();
    await expect(authedFetch("/me")).rejects.toMatchObject({ kind: "network" });
    expect(sessionStore.get()).toBe("signed-in");
    expect(sessionManager.hasSession()).toBe(true);
    expect(stored()).toBeDefined();
  });
});

describe("sign out", () => {
  it("clears the device first and still succeeds when the server cannot be reached", async () => {
    await sessionManager.signIn(api.newSession());
    api.offline = true;
    const result = await sessionManager.signOut();
    expect(result.serverNotified).toBe(false);
    expect(sessionStore.get()).toBe("signed-out");
    expect(secure.__dump()).toEqual({});
  });

  it("tells the server when it can, using the token that was current", async () => {
    const pair = api.newSession();
    await sessionManager.signIn(pair);
    const result = await sessionManager.signOut();
    expect(result.serverNotified).toBe(true);
    const call = api.calls.find((c) => c.path === "/auth/logout");
    expect(call?.auth).toBe(`Bearer ${pair.accessToken}`);
  });

  it("runs registered cleanup (cached account data) on every sign out", async () => {
    const cleanup = jest.fn();
    sessionManager.onCleared(cleanup);
    await sessionManager.signIn(api.newSession());
    await sessionManager.signOut();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
