import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { person } from "./access-helpers.js";
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

const mkCourse = () =>
  h.db.course.create({ data: { title: "Entitlement course", level: "beginner", priceCents: 0 } });
const row = (userId: string, courseId: string, over: Record<string, unknown> = {}) => ({
  userId,
  courseId,
  source: "admin_grant",
  grantReason: "Direct insert",
  ...over,
});
const revokedFields = { status: "revoked", revokedAt: new Date(), revokeReason: "Direct revoke" };

describe("the database refuses bad entitlements on its own", () => {
  it("rejects unknown sources and statuses and short or long reasons", async () => {
    const p = await person(h);
    const c = await mkCourse();
    const bad: Record<string, unknown>[] = [
      { source: "paypal" },
      { source: "" },
      { status: "suspended", revokedAt: new Date(), revokeReason: "Direct revoke" },
      { grantReason: "ab" },
      { grantReason: "x".repeat(201) },
    ];
    for (const over of bad) {
      await expect(
        h.db.entitlement.create({ data: row(p.id, c.id, over) as never }),
      ).rejects.toThrow();
    }
    await expect(
      h.db.entitlement.create({
        data: row(p.id, c.id, { status: "revoked", revokedAt: new Date(), revokeReason: "ab" }),
      }),
    ).rejects.toThrow();
    expect(await h.db.entitlement.count({ where: { userId: p.id } })).toBe(0);
  });

  it("requires revoke details exactly when revoked", async () => {
    const p = await person(h);
    const c = await mkCourse();
    await expect(
      h.db.entitlement.create({ data: row(p.id, c.id, { status: "revoked" }) }),
    ).rejects.toThrow();
    await expect(
      h.db.entitlement.create({
        data: row(p.id, c.id, { revokedAt: new Date(), revokeReason: "Direct revoke" }),
      }),
    ).rejects.toThrow();
    await h.db.entitlement.create({ data: row(p.id, c.id, revokedFields) });
  });

  it("allows one active entitlement per person and course, and any number of revoked ones", async () => {
    const p = await person(h);
    const q = await person(h);
    const c = await mkCourse();
    const other = await mkCourse();
    await h.db.entitlement.create({ data: row(p.id, c.id) });
    await expect(h.db.entitlement.create({ data: row(p.id, c.id) })).rejects.toThrow();
    // Different person or different course is fine.
    await h.db.entitlement.create({ data: row(q.id, c.id) });
    await h.db.entitlement.create({ data: row(p.id, other.id) });
    // History does not block, and a revoked row does not count as active.
    await h.db.entitlement
      .create({ data: row(p.id, other.id, revokedFields) })
      .catch(() => undefined);
    await h.db.entitlement.updateMany({
      where: { userId: p.id, courseId: c.id },
      data: revokedFields,
    });
    await h.db.entitlement.create({ data: row(p.id, c.id) });
    await h.db.entitlement.create({ data: row(p.id, c.id, revokedFields) });
    expect(await h.db.entitlement.count({ where: { userId: p.id, courseId: c.id } })).toBe(3);
  });

  it("refuses an entitlement for a person or course that does not exist", async () => {
    const p = await person(h);
    const c = await mkCourse();
    const nobody = "00000000-0000-4000-8000-000000000000";
    await expect(h.db.entitlement.create({ data: row(nobody, c.id) })).rejects.toThrow();
    await expect(h.db.entitlement.create({ data: row(p.id, nobody) })).rejects.toThrow();
  });
});
