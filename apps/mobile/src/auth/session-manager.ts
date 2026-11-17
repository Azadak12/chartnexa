import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import type { TokenPair } from "@chartnexa/api-contracts";
import { isAppError } from "../api/errors";
import { sessionStore } from "../session/session-store";
import { authHttp } from "./auth-http";
import { tokenStore, type StoredSession } from "./token-store";

export type RenewResult = "ok" | "ended" | "unreachable";

/** Renew when this little time is left on the access token. */
export const RENEW_BEFORE_MS = 60_000;
/** Background retry delays while the server cannot be reached. */
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 120_000];

interface Access {
  token: string;
  expiresAt: number;
}

export const SESSION_ENDED_NOTICE = "Your session ended. Please sign in again.";
export const SIGNED_OUT_OFFLINE_NOTICE =
  "You are signed out on this device. We could not reach the server, so your session there will end on its own.";

/**
 * Owns every token. The server rotates the refresh token on each use and treats a reused one as
 * theft (it ends the whole session), so this class never sends the same refresh token twice and
 * shares one renewal among all callers.
 */
class SessionManager {
  private access: Access | null = null;
  private refreshSession: StoredSession | null = null;
  private inflight: Promise<RenewResult> | null = null;
  /** Refresh tokens the server has already rotated. They are never sent again. */
  private readonly used = new Set<string>();
  private persistRetry: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryIndex = 0;
  private clearCallbacks: Array<() => void> = [];
  private subscriptions: Array<{ remove: () => void } | (() => void)> = [];

  /** Registers cleanup work for sign-out (for example clearing cached account data). */
  onCleared(cb: () => void): void {
    this.clearCallbacks.push(cb);
  }

  hasSession(): boolean {
    return this.refreshSession !== null;
  }

  /** The current access token without renewing (null when none or expired). */
  currentAccessToken(): string | null {
    return this.access && this.access.expiresAt > Date.now() ? this.access.token : null;
  }

  // --- launch -------------------------------------------------------------------------------

  /** Checks secure storage at launch and settles the session state exactly once. */
  async restore(): Promise<void> {
    const stored = await tokenStore.load();
    if (!stored) {
      sessionStore.set("signed-out");
      return;
    }
    this.refreshSession = stored;
    const result = await this.renew();
    if (result === "ok") {
      this.startWatching();
      sessionStore.set("signed-in");
    } else if (result === "ended") {
      sessionStore.set("signed-out");
    } else {
      // Offline or server down: stay signed in without an access token and keep trying.
      this.startWatching();
      sessionStore.set("signed-in");
      this.scheduleRetry();
    }
  }

  // --- sign in / out -------------------------------------------------------------------------

  async signIn(pair: TokenPair): Promise<void> {
    this.applyPair(pair);
    // Storing before declaring the person signed in means a restart right now still works.
    await this.persistWithRetry();
    this.startWatching();
    sessionStore.setNotice(null);
    sessionStore.set("signed-in");
  }

  /**
   * Signs out on this device immediately, then tells the server on a best-effort basis.
   * Returns whether the server confirmed.
   */
  async signOut(): Promise<{ serverNotified: boolean }> {
    const accessToken = this.currentAccessToken();
    await this.clearLocal();
    sessionStore.set("signed-out");
    if (!accessToken) return { serverNotified: false };
    try {
      await authHttp.logout(accessToken);
      return { serverNotified: true };
    } catch (e) {
      // A 401 means the server already ended it, which is the outcome we wanted.
      return { serverNotified: isAppError(e) && e.kind === "unauthorized" };
    }
  }

  /** The session is over (rejected, revoked elsewhere, deleted). Clears the device and explains. */
  async endSession(notice: string = SESSION_ENDED_NOTICE): Promise<void> {
    await this.clearLocal();
    sessionStore.setNotice(notice);
    sessionStore.set("signed-out");
  }

  /** Clears the device after a server-confirmed end of all sessions or account deletion. */
  async clearAfterServerEnd(notice: string | null): Promise<void> {
    await this.clearLocal();
    sessionStore.setNotice(notice);
    sessionStore.set("signed-out");
  }

  // --- tokens --------------------------------------------------------------------------------

  /** A usable access token, renewing first when it is close to expiry. Null when signed out. */
  async getAccessToken(): Promise<string | null> {
    if (!this.refreshSession) return null;
    if (!this.access || this.access.expiresAt - Date.now() < RENEW_BEFORE_MS) {
      await this.renew();
    }
    return this.currentAccessToken();
  }

  /** One renewal at a time: every caller waits for the same one. */
  renew(): Promise<RenewResult> {
    if (!this.inflight) {
      this.inflight = this.doRenew().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async doRenew(): Promise<RenewResult> {
    const current = this.refreshSession;
    if (!current) return "ended";
    if (this.used.has(current.refreshToken)) {
      // Defensive: a rotated token must never be sent again.
      await this.endSession();
      return "ended";
    }
    try {
      const pair = await authHttp.refresh(current.refreshToken);
      this.used.add(current.refreshToken);
      this.applyPair(pair);
      // Save the new refresh token before any request can use the new access token.
      await this.persistWithRetry();
      this.retryIndex = 0;
      return "ok";
    } catch (e) {
      if (isAppError(e) && e.kind === "unauthorized") {
        await this.endSession();
        return "ended";
      }
      // Offline, timeout, server error or rate limit: the session may still be good.
      return "unreachable";
    }
  }

  private applyPair(pair: TokenPair): void {
    this.refreshSession = { refreshToken: pair.refreshToken, sessionId: pair.sessionId };
    this.access = { token: pair.accessToken, expiresAt: Date.now() + pair.expiresIn * 1000 };
  }

  /**
   * The in-memory token is the source of truth. If secure storage fails, keep it and retry,
   * because losing a rotated token would make the next renewal reuse the old one.
   */
  private async persistWithRetry(): Promise<void> {
    const session = this.refreshSession;
    if (!session) return;
    try {
      await tokenStore.save(session);
    } catch {
      if (this.persistRetry) clearTimeout(this.persistRetry);
      this.persistRetry = setTimeout(() => {
        this.persistRetry = null;
        void this.persistWithRetry();
      }, 2_000);
    }
  }

  // --- unreachable server ---------------------------------------------------------------------

  private scheduleRetry(): void {
    if (this.retryTimer || !this.refreshSession) return;
    const delay = RETRY_DELAYS_MS[Math.min(this.retryIndex, RETRY_DELAYS_MS.length - 1)] as number;
    this.retryIndex++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.renew().then((r) => {
        if (r === "unreachable") this.scheduleRetry();
      });
    }, delay);
  }

  // --- foreground and network ------------------------------------------------------------------

  private startWatching(): void {
    if (this.subscriptions.length > 0) return;
    const appSub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active" && this.refreshSession) void this.getAccessToken();
    });
    const netUnsub = NetInfo.addEventListener((s) => {
      if (s.isConnected && this.refreshSession && !this.currentAccessToken())
        void this.renewAfterReconnect();
    });
    this.subscriptions = [appSub, netUnsub];
  }

  /**
   * A renewal may already be failing because the network was down a moment ago; when the
   * network reports it is back, try once more after that attempt settles.
   */
  private async renewAfterReconnect(): Promise<void> {
    const first = await this.renew();
    if (first === "unreachable" && this.refreshSession && !this.currentAccessToken()) {
      await this.renew();
    }
  }

  private stopWatching(): void {
    for (const s of this.subscriptions) {
      if (typeof s === "function") s();
      else s.remove();
    }
    this.subscriptions = [];
  }

  // --- cleanup --------------------------------------------------------------------------------

  private async clearLocal(): Promise<void> {
    this.stopWatching();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.persistRetry) clearTimeout(this.persistRetry);
    this.retryTimer = null;
    this.persistRetry = null;
    this.retryIndex = 0;
    this.access = null;
    this.refreshSession = null;
    this.used.clear();
    await tokenStore.clear();
    this.clearCallbacks.forEach((cb) => cb());
  }

  /** Test hook: replace the access token (for example with an invalid one). */
  _setAccessTokenForTests(token: string, expiresInMs: number): void {
    this.access = { token, expiresAt: Date.now() + expiresInMs };
  }

  /** Test hook: forget everything without touching storage or listeners elsewhere. */
  _resetForTests(): void {
    this.stopWatching();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.persistRetry) clearTimeout(this.persistRetry);
    this.retryTimer = null;
    this.persistRetry = null;
    this.retryIndex = 0;
    this.access = null;
    this.refreshSession = null;
    this.inflight = null;
    this.used.clear();
    this.clearCallbacks = [];
  }
}

export const sessionManager = new SessionManager();
