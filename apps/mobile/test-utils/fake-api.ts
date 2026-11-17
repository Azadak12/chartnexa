/**
 * A tiny stand-in for the API's session rules, used to test the app's session handling.
 * It rotates refresh tokens on every use and, like the real server, ends the whole session when
 * an already-rotated token is presented.
 */
export interface FakeSession {
  id: string;
  current: string;
  previous: Set<string>;
  revoked: boolean;
}

export class FakeApi {
  sessions = new Map<string, FakeSession>();
  accessOwners = new Map<string, string>();
  refreshCalls: string[] = [];
  calls: Array<{ path: string; method: string; auth: string | null; body: unknown }> = [];
  /** Set to simulate the network being down. */
  offline = false;
  /** Overrides: respond to a path with a fixed status. */
  forced = new Map<string, number>();
  expiresIn = 600;
  private n = 0;

  readonly fetch = jest.fn(
    async (url: string, init: RequestInit & { headers: Record<string, string> }) => {
      if (this.offline) throw new TypeError("Network request failed");
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      const method = init.method ?? "GET";
      const auth = init.headers["authorization"] ?? null;
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      this.calls.push({ path, method, auth, body });
      const forced = this.forced.get(path);
      if (forced)
        return this.respond(
          forced,
          forced === 401 ? this.err("UNAUTHENTICATED") : this.err("INTERNAL_ERROR"),
        );

      if (path === "/auth/refresh" && method === "POST")
        return this.refresh(String(body?.refreshToken));
      if (path === "/auth/logout" && method === "POST")
        return this.authed(auth, () => this.respond(200, { status: "ok" }));
      if (path === "/me" && method === "GET") {
        return this.authed(auth, () =>
          this.respond(200, {
            id: "u1",
            email: "a@b.co",
            displayName: null,
            emailVerified: true,
            createdAt: new Date().toISOString(),
          }),
        );
      }
      return this.respond(404, this.err("NOT_FOUND"));
    },
  );

  err(code: string) {
    return { code, message: "RAW SERVER TEXT", requestId: "req-12345678" };
  }

  respond(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    } as unknown as Response;
  }

  /** Creates a session and returns the token pair a login would. */
  newSession() {
    const id = `session-${++this.n}`;
    const s: FakeSession = {
      id,
      current: `refresh-${id}-1-xxxxxxxxxxxxxxxx`,
      previous: new Set(),
      revoked: false,
    };
    this.sessions.set(id, s);
    return this.pair(s);
  }

  private pair(s: FakeSession) {
    const access = `access-${s.id}-${++this.n}`;
    this.accessOwners.set(access, s.id);
    return {
      accessToken: access,
      refreshToken: s.current,
      sessionId: s.id,
      expiresIn: this.expiresIn,
    };
  }

  private refresh(token: string): Response {
    const s = [...this.sessions.values()].find((x) => x.current === token || x.previous.has(token));
    if (!s || s.revoked) return this.respond(401, this.err("UNAUTHENTICATED"));
    this.refreshCalls.push(token);
    if (s.previous.has(token)) {
      s.revoked = true; // reuse of a rotated token ends the session
      return this.respond(401, this.err("UNAUTHENTICATED"));
    }
    s.previous.add(token);
    s.current = `refresh-${s.id}-${++this.n}-xxxxxxxxxxxxxxxx`;
    return this.respond(200, this.pair(s));
  }

  private authed(auth: string | null, ok: () => Response): Response {
    const access = auth?.replace(/^Bearer /, "") ?? "";
    const id = this.accessOwners.get(access);
    const s = id ? this.sessions.get(id) : undefined;
    if (!s || s.revoked) return this.respond(401, this.err("UNAUTHENTICATED"));
    return ok();
  }

  /** Marks every access token as no longer accepted (as if they all expired). */
  expireAccessTokens(): void {
    this.accessOwners.clear();
  }

  install(): void {
    (globalThis as { fetch: unknown }).fetch = this.fetch;
  }
}
