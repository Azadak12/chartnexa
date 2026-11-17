import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { errorEnvelopeSchema, type AuditEvent } from "@chartnexa/api-contracts";
import { AuditService } from "../src/modules/access/index.js";
import { assign, person, revoke, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let admin: Person;
let audit: AuditService;
beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
  audit = h.t.app.get(AuditService);
  admin = await person(h, "admin");
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

const list = (query = "", token = admin.accessToken) =>
  h.call("GET", `/staff/audit-events${query}`, { token });

describe("immutability", () => {
  it("rejects UPDATE, DELETE and TRUNCATE through the application connection", async () => {
    await audit.recordDenied({
      actorKind: "user",
      actorUserId: admin.id,
      action: "probe",
      targetType: "t",
      targetId: "x",
    });
    const before = await h.db.auditEvent.count();
    expect(before).toBeGreaterThan(0);
    await expect(
      h.db.$executeRawUnsafe(`UPDATE audit_events SET action = 'tampered'`),
    ).rejects.toThrow(/append-only/);
    await expect(h.db.$executeRawUnsafe(`DELETE FROM audit_events`)).rejects.toThrow(/append-only/);
    await expect(h.db.$executeRawUnsafe(`TRUNCATE audit_events`)).rejects.toThrow(/append-only/);
    await expect(h.db.auditEvent.updateMany({ data: { reason: "x" } })).rejects.toThrow();
    await expect(h.db.auditEvent.deleteMany({})).rejects.toThrow();
    expect(await h.db.auditEvent.count()).toBe(before);
    expect(await h.db.auditEvent.count({ where: { action: "tampered" } })).toBe(0);
  });
});

describe("atomic recording", () => {
  it("leaves no record when the change rolls back", async () => {
    const marker = `rollback-${Date.now()}`;
    await expect(
      h.db.$transaction(async (tx) => {
        await audit.record(tx, {
          actorKind: "user",
          actorUserId: admin.id,
          action: marker,
          targetType: "t",
          targetId: "x",
          outcome: "success",
        });
        throw new Error("change failed");
      }),
    ).rejects.toThrow("change failed");
    expect(await h.db.auditEvent.count({ where: { action: marker } })).toBe(0);
  });

  it("holds ids and names only, never emails, tokens or hashes", async () => {
    const target = await person(h);
    await assign(h, admin, target.id, "instructor", "Audit content check");
    await revoke(h, admin, target.id, "Audit content check done");
    const rows = await h.db.auditEvent.findMany({ where: { targetId: target.id } });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const text = JSON.stringify(rows);
    for (const secret of [
      target.email,
      target.email.toLowerCase(),
      target.password,
      target.accessToken,
      target.refreshToken,
      "$argon2",
      admin.email.toLowerCase(),
    ]) {
      expect(text.includes(secret), `audit rows contain ${secret.slice(0, 10)}`).toBe(false);
    }
  });
});

describe("reading the audit trail", () => {
  it("lists newest first with each filter, one page at a time", async () => {
    const t1 = await person(h);
    const t2 = await person(h);
    await assign(h, admin, t1.id, "instructor");
    await assign(h, admin, t2.id, "manager");
    await revoke(h, admin, t1.id);

    const all = (await list("?limit=100")).json() as {
      items: AuditEvent[];
      nextCursor: string | null;
    };
    const times = all.items.map((e) => e.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);

    const byTarget = (await list(`?targetId=${t1.id}`)).json() as { items: AuditEvent[] };
    expect(byTarget.items.map((e) => e.action).sort()).toEqual(["role.assign", "role.revoke"]);
    expect(byTarget.items.every((e) => e.targetId === t1.id)).toBe(true);

    const byAction = (await list(`?action=role.revoke&limit=100`)).json() as {
      items: AuditEvent[];
    };
    expect(byAction.items.length).toBeGreaterThan(0);
    expect(byAction.items.every((e) => e.action === "role.revoke")).toBe(true);

    const byActor = (await list(`?actorUserId=${admin.id}&limit=100`)).json() as {
      items: AuditEvent[];
    };
    expect(byActor.items.every((e) => e.actorUserId === admin.id)).toBe(true);

    const student = await person(h);
    await assign(h, student, t2.id, "admin");
    const denied = (await list(`?outcome=denied&limit=100`)).json() as { items: AuditEvent[] };
    expect(denied.items.length).toBeGreaterThan(0);
    expect(denied.items.every((e) => e.outcome === "denied")).toBe(true);

    const future = (
      await list(`?from=${new Date(Date.now() + 3600_000).toISOString()}`)
    ).json() as { items: AuditEvent[] };
    expect(future.items).toEqual([]);
    const past = (
      await list(`?to=${new Date(Date.now() + 3600_000).toISOString()}&limit=100`)
    ).json() as { items: AuditEvent[] };
    expect(past.items.length).toBeGreaterThan(0);
  });

  it("pages stably while records are added between page requests", async () => {
    for (let i = 0; i < 7; i++) {
      await audit.recordDenied({
        actorKind: "system",
        action: "paging.seed",
        targetType: "t",
        targetId: `seed-${i}`,
      });
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let round = 0;
    do {
      const res = (
        await list(
          `?action=paging.seed&limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        )
      ).json() as {
        items: AuditEvent[];
        nextCursor: string | null;
      };
      expect(res.items.length).toBeLessThanOrEqual(3);
      seen.push(...res.items.map((e) => e.id));
      cursor = res.nextCursor;
      // New records appear while paging; they sort newer and must not disturb older pages.
      if (round++ === 0) {
        await audit.recordDenied({
          actorKind: "system",
          action: "paging.seed",
          targetType: "t",
          targetId: "late",
        });
      }
    } while (cursor);
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("rejects tampered cursors and invalid filters with 400", async () => {
    for (const q of [
      "?cursor=tampered.value",
      "?limit=0",
      "?limit=101",
      "?outcome=maybe",
      "?actorUserId=nope",
      "?from=yesterday",
      "?bogus=1",
      "?action=",
    ]) {
      const res = await list(q);
      expect(res.statusCode, q).toBe(400);
      expect(errorEnvelopeSchema.parse(res.json()).requestId).toBeTruthy();
    }
  });

  it("denies non-Admins and records the denied attempt", async () => {
    for (const role of ["manager", "instructor", undefined] as const) {
      const p = await person(h, role);
      const res = await list("", p.accessToken);
      expect(res.statusCode).toBe(403);
      const rows = await h.db.auditEvent.findMany({
        where: { actorUserId: p.id, action: "audit.read" },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ outcome: "denied", reason: "missing_permission" });
    }
    expect((await h.call("GET", "/staff/audit-events")).statusCode).toBe(401);
  });
});
