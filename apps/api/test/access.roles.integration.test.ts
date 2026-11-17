import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RolesService } from "../src/modules/access/index.js";
import { errorEnvelopeSchema } from "@chartnexa/api-contracts";
import { activeRole, assign, auditRows, clearAdmins, person, revoke } from "./access-helpers.js";
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

describe("assigning roles", () => {
  it("lets an Admin assign Instructor and records an audited change", async () => {
    const admin = await person(h, "admin");
    const target = await person(h);
    const res = await assign(h, admin, target.id, "instructor", "Joins the trading team");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: target.id, staffRole: "instructor" });
    expect(await activeRole(h, target.id)).toBe("instructor");
    const rows = await auditRows(h, { targetId: target.id, action: "role.assign" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorKind: "user",
      actorUserId: admin.id,
      outcome: "success",
      reason: "Joins the trading team",
      before: { role: null },
      after: { role: "instructor" },
    });
    expect(rows[0]?.requestId).toBeTruthy();
  });

  it("replaces a role as one change with one audit record and one active role", async () => {
    const admin = await person(h, "admin");
    const target = await person(h, "instructor");
    expect((await assign(h, admin, target.id, "manager")).statusCode).toBe(200);
    expect(await activeRole(h, target.id)).toBe("manager");
    expect(await h.db.userRole.count({ where: { userId: target.id, revokedAt: null } })).toBe(1);
    expect(await h.db.userRole.count({ where: { userId: target.id } })).toBe(2);
    const rows = await auditRows(h, { targetId: target.id, action: "role.assign" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ before: { role: "instructor" }, after: { role: "manager" } });
  });

  it("denies every non-Admin, leaves the role unchanged and audits each denial", async () => {
    const target = await person(h);
    for (const role of [undefined, "instructor", "manager"] as const) {
      const actor = await person(h, role);
      const res = await assign(h, actor, target.id, "manager");
      expect(res.statusCode).toBe(403);
      expect(errorEnvelopeSchema.parse(res.json()).code).toBe("FORBIDDEN");
      const denied = await auditRows(h, { actorUserId: actor.id, outcome: "denied" });
      expect(denied).toHaveLength(1);
      expect(denied[0]).toMatchObject({ action: "role.assign", targetId: target.id });
    }
    expect(await activeRole(h, target.id)).toBeNull();
  });

  it("requires a reason of 3 to 200 characters", async () => {
    const admin = await person(h, "admin");
    const target = await person(h);
    for (const body of [
      { role: "instructor" },
      { role: "instructor", reason: "ab" },
      { role: "instructor", reason: "x".repeat(201) },
    ]) {
      const res = await h.call("PUT", `/staff/users/${target.id}/role`, {
        token: admin.accessToken,
        body,
      });
      expect(res.statusCode).toBe(400);
      expect(errorEnvelopeSchema.parse(res.json()).fields?.some((f) => f.field === "reason")).toBe(
        true,
      );
    }
    expect(await activeRole(h, target.id)).toBeNull();
  });

  it("rejects unverified, disabled, deleted and unknown targets and malformed ids", async () => {
    const admin = await person(h, "admin");
    const unverified = await person(h, undefined, false);
    const disabled = await person(h);
    await h.db.user.update({ where: { id: disabled.id }, data: { status: "disabled" } });
    const deleted = await person(h);
    await h.call("DELETE", "/me", {
      token: deleted.accessToken,
      body: { password: deleted.password },
    });
    for (const t of [unverified, disabled, deleted]) {
      expect((await assign(h, admin, t.id, "instructor")).statusCode).toBe(400);
      expect(await activeRole(h, t.id)).toBeNull();
    }
    expect(
      (await assign(h, admin, "11111111-1111-4111-8111-111111111111", "instructor")).statusCode,
    ).toBe(404);
    expect(
      (
        await h.call("PUT", "/staff/users/not-a-uuid/role", {
          token: admin.accessToken,
          body: { role: "instructor", reason: "valid reason" },
        })
      ).statusCode,
    ).toBe(400);
  });

  it("rejects an Admin changing their own role and audits it", async () => {
    const admin = await person(h, "admin");
    const res = await assign(h, admin, admin.id, "instructor");
    expect(res.statusCode).toBe(403);
    expect(await activeRole(h, admin.id)).toBe("admin");
    const denied = await auditRows(h, { actorUserId: admin.id, outcome: "denied" });
    expect(denied[0]).toMatchObject({ action: "role.assign", reason: "self_change" });
    expect((await revoke(h, admin, admin.id)).statusCode).toBe(403);
  });
});

describe("revoking roles and the last Admin", () => {
  it("revokes a role and rejects revoking a user without one", async () => {
    const admin = await person(h, "admin");
    const instructor = await person(h, "instructor");
    expect((await revoke(h, admin, instructor.id, "Moved to another team")).statusCode).toBe(200);
    expect(await activeRole(h, instructor.id)).toBeNull();
    expect((await revoke(h, admin, instructor.id)).statusCode).toBe(404);
    const rows = await auditRows(h, { targetId: instructor.id, action: "role.revoke" });
    expect(rows[0]).toMatchObject({
      before: { role: "instructor" },
      after: { role: null },
      reason: "Moved to another team",
    });
  });

  it("keeps the sole Admin in place: they cannot demote or revoke themselves", async () => {
    const sole = await person(h, "admin");
    await clearAdmins(h, [sole.id]);
    expect((await revoke(h, sole, sole.id)).statusCode).toBe(403);
    expect((await assign(h, sole, sole.id, "manager")).statusCode).toBe(403);
    expect(await h.db.userRole.count({ where: { role: "admin", revokedAt: null } })).toBe(1);
    expect(await activeRole(h, sole.id)).toBe("admin");
  });

  it("denies an Admin who lost the role while their request was in flight", async () => {
    const a = await person(h, "admin");
    const b = await person(h, "admin");
    await clearAdmins(h, [a.id, b.id]);
    expect((await revoke(h, a, b.id)).statusCode).toBe(200);
    // b's token is still valid, but b is no longer an Admin, so b cannot remove the last Admin.
    const res = await revoke(h, b, a.id);
    expect(res.statusCode).toBe(403);
    expect(await activeRole(h, a.id)).toBe("admin");
  });

  it("re-checks the actor inside the transaction, even when the route guard was bypassed", async () => {
    const a = await person(h, "admin");
    const notAdmin = await person(h, "manager");
    await clearAdmins(h, [a.id]);
    const roles = h.t.app.get(RolesService);
    await expect(
      roles.revokeRole({ userId: notAdmin.id }, a.id, "should not be allowed"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      roles.assignRole({ userId: notAdmin.id }, a.id, "manager", "should not be allowed"),
    ).rejects.toMatchObject({ status: 403 });
    expect(await activeRole(h, a.id)).toBe("admin");
    const denied = await auditRows(h, { actorUserId: notAdmin.id, outcome: "denied" });
    expect(denied.some((r) => r.reason === "actor_not_authorized")).toBe(true);
  });

  it("leaves at least one Admin when two Admins demote each other at the same moment", async () => {
    for (let i = 0; i < 15; i++) {
      const a = await person(h, "admin");
      const b = await person(h, "admin");
      await clearAdmins(h, [a.id, b.id]);
      const [r1, r2] = await Promise.all([revoke(h, a, b.id), revoke(h, b, a.id)]);
      const codes = [r1.statusCode, r2.statusCode].sort();
      expect(codes.filter((c) => c === 200).length, `round ${i}: ${codes}`).toBeLessThanOrEqual(1);
      expect(
        await h.db.userRole.count({ where: { role: "admin", revokedAt: null } }),
        `round ${i}`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("denies a revoked Manager's existing token on the next request", async () => {
    const admin = await person(h, "admin");
    const manager = await person(h, "manager");
    const target = await person(h);
    const lookup = () =>
      h.call("GET", `/staff/users/lookup?email=${encodeURIComponent(target.email.toLowerCase())}`, {
        token: manager.accessToken,
      });
    expect((await lookup()).statusCode).toBe(200);
    expect((await revoke(h, admin, manager.id)).statusCode).toBe(200);
    expect((await lookup()).statusCode).toBe(403);
  });
});

describe("deleting an account ends its role", () => {
  it("ends an Instructor's role with an audit record", async () => {
    const instructor = await person(h, "instructor");
    const res = await h.call("DELETE", "/me", {
      token: instructor.accessToken,
      body: { password: instructor.password },
    });
    expect(res.statusCode).toBe(200);
    expect(await activeRole(h, instructor.id)).toBeNull();
    const rows = await auditRows(h, { targetId: instructor.id, action: "role.revoke" });
    expect(rows[0]).toMatchObject({
      reason: "account_deleted",
      before: { role: "instructor" },
      outcome: "success",
    });
  });

  it("rejects the last Admin deleting their account and changes nothing", async () => {
    const admin = await person(h, "admin");
    await clearAdmins(h, [admin.id]);
    const res = await h.call("DELETE", "/me", {
      token: admin.accessToken,
      body: { password: admin.password },
    });
    expect(res.statusCode).toBe(409);
    expect(await activeRole(h, admin.id)).toBe("admin");
    expect((await h.call("GET", "/me", { token: admin.accessToken })).statusCode).toBe(200);
    const user = await h.db.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(user.status).toBe("active");
    expect(user.email).not.toBeNull();
  });

  it("lets an Admin delete their account when another Admin exists", async () => {
    const a = await person(h, "admin");
    const b = await person(h, "admin");
    await clearAdmins(h, [a.id, b.id]);
    expect(
      (await h.call("DELETE", "/me", { token: a.accessToken, body: { password: a.password } }))
        .statusCode,
    ).toBe(200);
    expect(await activeRole(h, b.id)).toBe("admin");
  });
});
