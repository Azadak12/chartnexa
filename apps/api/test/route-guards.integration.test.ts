import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { RequestMethod } from "@nestjs/common";
import { ModulesContainer } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

const join = (...parts: string[]) =>
  "/" +
  parts
    .flatMap((p) => p.split("/"))
    .filter(Boolean)
    .join("/");

/** Every route with the names of the guards on it (from the handler and its controller). */
function routes(): { route: string; guards: string[] }[] {
  const out: { route: string; guards: string[] }[] = [];
  for (const mod of h.t.app.get(ModulesContainer).values()) {
    for (const wrapper of mod.controllers.values()) {
      const ctrl = wrapper.metatype as (new (...a: unknown[]) => unknown) | null;
      if (!ctrl) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? "");
      const classGuards = (Reflect.getMetadata(GUARDS_METADATA, ctrl) ?? []) as { name: string }[];
      const proto = ctrl.prototype as Record<string, unknown>;
      for (const key of Object.getOwnPropertyNames(proto)) {
        const handler = proto[key];
        if (key === "constructor" || typeof handler !== "function") continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (path === undefined) continue;
        const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
        const guards = [
          ...classGuards,
          ...((Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as { name: string }[]),
        ].map((g) => g.name);
        out.push({ route: `${method} ${join(base, path)}`, guards });
      }
    }
  }
  return out;
}

/**
 * Routes anyone may call without signing in, each reviewed (security review 2026-11-19).
 * Adding a route without a guard fails this test until it is reviewed and listed here.
 */
const PUBLIC = [
  // Health (/metrics is a plain Fastify route, protected by METRICS_TOKEN in production).
  "GET /health/live",
  "GET /health/ready",
  // Signing in and recovering an account: rate limited, answers do not reveal accounts.
  "POST /auth/register",
  "POST /auth/login",
  "POST /auth/refresh",
  "POST /auth/password/forgot",
  "POST /auth/password/reset",
  "POST /auth/email/verify",
  "POST /auth/mfa/verify",
  // Accepting an invitation: the emailed single-use code is the permission; rate limited.
  "POST /auth/instructor-invitations/accept",
  "POST /auth/mfa/setup/start",
  "POST /auth/mfa/setup/complete",
  // Signed links: the token in the address is the permission (short-lived, HMAC).
  "GET /files/:resourceId",
  "GET /assignment-files/:id",
  "GET /videos/:videoId/stream",
  // Payment provider callbacks: verified by signature, not by a session.
  "POST /payments/webhooks/:provider",
  // Published catalog.
  "GET /categories",
  "GET /courses",
  // Course thumbnail images (unguessable ids, validated image bytes).
  "GET /courses/thumbnails/:id",
];

describe("every route is protected or reviewed as public", () => {
  it("has no unguarded route outside the reviewed list", () => {
    const all = routes();
    expect(all.length).toBeGreaterThan(80);
    // Routes under /test exist only in this harness (makeHarness adds them for error tests).
    const open = all
      .filter((r) => r.guards.length === 0 && !/ \/test\//.test(r.route))
      .map((r) => r.route)
      .sort();
    expect(open).toEqual([...PUBLIC].sort());
  });

  it("puts a permission check behind authentication on every staff route", () => {
    const staff = routes().filter((r) => / \/staff\//.test(r.route));
    expect(staff.length).toBeGreaterThan(30);
    for (const r of staff) {
      expect(r.guards, r.route).toEqual(["AuthGuard", "PermissionGuard"]);
    }
  });

  it("requires a sign-in on every personal (/me) route", () => {
    for (const r of routes().filter((x) => / \/me(\/|$)/.test(x.route))) {
      expect(r.guards, r.route).toContain("AuthGuard");
    }
  });
});
