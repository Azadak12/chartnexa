import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activeRole, auditRows, person } from "./access-helpers.js";
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

describe("a Manager trying to escalate", () => {
  it("is blocked, leaves every role unchanged and is audited, with no secrets in logs", async () => {
    const admin = await person(h, "admin");
    const manager = await person(h, "manager");
    const victim = await person(h, "instructor");
    const bearer = { token: manager.accessToken };

    const attempts = [
      h.call("PUT", `/staff/users/${manager.id}/role`, {
        ...bearer,
        body: { role: "admin", reason: "make me admin" },
      }),
      h.call("PUT", `/staff/users/${victim.id}/role`, {
        ...bearer,
        body: { role: "manager", reason: "promote my friend" },
      }),
      h.call("POST", `/staff/users/${admin.id}/role/revoke`, {
        ...bearer,
        body: { reason: "remove the admin" },
      }),
      h.call("POST", `/staff/users/${manager.id}/role/revoke`, {
        ...bearer,
        body: { reason: "reset myself" },
      }),
      h.call("GET", "/staff/audit-events", bearer),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("FORBIDDEN");
    }

    expect(await activeRole(h, manager.id)).toBe("manager");
    expect(await activeRole(h, victim.id)).toBe("instructor");
    expect(await activeRole(h, admin.id)).toBe("admin");
    const access = (await h.call("GET", "/me/access", bearer)).json();
    expect(access.roles).toEqual(["student", "manager"]);
    expect(access.permissions).not.toContain("roles:manage");

    const denied = await auditRows(h, { actorUserId: manager.id, outcome: "denied" });
    expect(denied.map((r) => r.action).sort()).toEqual([
      "audit.read",
      "role.assign",
      "role.assign",
      "role.revoke",
      "role.revoke",
    ]);
    const success = await auditRows(h, { actorUserId: manager.id, outcome: "success" });
    expect(success).toHaveLength(0);

    const logs = h.t.logs();
    for (const secret of [
      manager.password,
      manager.accessToken,
      manager.refreshToken,
      manager.email.toLowerCase(),
      "make me admin",
    ]) {
      expect(logs.includes(secret)).toBe(false);
    }
    expect(logs).toContain("authz.denied");
  });
});

describe("openapi for access", () => {
  it("lists the new routes with 403 envelope responses", async () => {
    const doc = (await h.t.app.inject({ method: "GET", url: "/openapi.json" })).json();
    for (const path of [
      "/me/access",
      "/staff/users/lookup",
      "/staff/users/{id}/role",
      "/staff/users/{id}/role/revoke",
      "/staff/audit-events",
    ]) {
      expect(doc.paths[path], path).toBeDefined();
    }
    const put = doc.paths["/staff/users/{id}/role"].put.responses;
    expect(put["403"].content["application/json"].schema.$ref).toBe(
      "#/components/schemas/ErrorEnvelope",
    );
    expect(put["401"]).toBeDefined();
    expect(doc.paths["/staff/audit-events"].get.responses["403"]).toBeDefined();
  });
});
