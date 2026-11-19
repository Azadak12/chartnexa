import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Order, Page, PublicCourseDetail, StaffOrder } from "@chartnexa/api-contracts";
import { CoursesService } from "../src/modules/courses/index.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

const SECRET = "contract-webhook-secret-contract-webhook-secret";
let h: Harness;
let drop: () => Promise<void>;
let admin: Person;
let manager: Person;
let courses: CoursesService;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url, { PAYMENT_TEST_WEBHOOK_SECRET: SECRET });
  courses = h.t.app.get(CoursesService);
  admin = await person(h, "admin");
  manager = await person(h, "manager");
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

const mkCourse = async (priceCents = 4900, publish = true) => {
  const c = await courses.create(
    admin.id,
    {
      title: "Paid course",
      description: "A complete description",
      level: "beginner",
      priceCents,
      coverTone: "blue",
    } as never,
    "rq",
  );
  return publish ? courses.publish(admin.id, c.id, "rp") : c;
};
const buy = (p: Person, courseId: string, key: string | null = randomUUID()) =>
  h.call("POST", "/me/orders", {
    token: p.accessToken,
    body: { courseId },
    ...(key ? { headers: { "idempotency-key": key } } : {}),
  });
const finish = (p: Person, ref: string, outcome: string) =>
  h.call("POST", `/payments/test/checkouts/${ref}/complete`, {
    token: p.accessToken,
    body: { outcome },
  });
const event = (body: Record<string, unknown>, signature?: string) => {
  const raw = JSON.stringify(body);
  return h.call("POST", "/payments/webhooks/test", {
    body,
    headers: {
      "x-payment-signature": signature ?? createHmac("sha256", SECRET).update(raw).digest("hex"),
    },
  });
};
const enrolled = async (p: Person, courseId: string) =>
  (
    (
      await h.call("GET", `/courses/${courseId}`, { token: p.accessToken })
    ).json() as PublicCourseDetail
  ).enrolled;
const active = (userId: string, courseId: string) =>
  h.db.entitlement.count({ where: { userId, courseId, status: "active" } });

describe("starting a purchase", () => {
  it("needs an Idempotency-Key, and the same key returns the same order", async () => {
    const c = await mkCourse();
    const p = await person(h);
    expect((await buy(p, c.id, null)).statusCode).toBe(400);
    const key = randomUUID();
    const first = (await buy(p, c.id, key)).json() as Order;
    expect(first).toMatchObject({
      status: "pending",
      amountCents: 4900,
      currency: "USD",
      testMode: true,
      courseTitle: "Paid course",
    });
    expect(((await buy(p, c.id, key)).json() as Order).id).toBe(first.id);
    const other = await mkCourse();
    const reused = await buy(p, other.id, key);
    expect(reused.statusCode).toBe(409);
    expect((reused.json() as { code: string }).code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("resumes the unfinished checkout instead of starting a second one, even at once", async () => {
    const c = await mkCourse();
    const p = await person(h);
    const res = await Promise.all(Array.from({ length: 6 }, () => buy(p, c.id)));
    expect(res.every((r) => r.statusCode === 200)).toBe(true);
    expect(new Set(res.map((r) => (r.json() as Order).id)).size).toBe(1);
    expect(await h.db.order.count({ where: { userId: p.id, courseId: c.id } })).toBe(1);
  });

  it("refuses an owned, free, unpublished or unknown course, and signed-out callers", async () => {
    const p = await person(h);
    const owned = await mkCourse();
    await h.db.entitlement.create({
      data: { userId: p.id, courseId: owned.id, source: "admin_grant", grantReason: "Test grant" },
    });
    expect(((await buy(p, owned.id)).json() as { code: string }).code).toBe("ALREADY_OWNED");
    expect(((await buy(p, (await mkCourse(0)).id)).json() as { code: string }).code).toBe(
      "COURSE_FREE",
    );
    expect((await buy(p, (await mkCourse(4900, false)).id)).statusCode).toBe(404);
    expect((await buy(p, randomUUID())).statusCode).toBe(404);
    expect(
      (
        await h.call("POST", "/me/orders", {
          body: { courseId: owned.id },
          headers: { "idempotency-key": randomUUID() },
        })
      ).statusCode,
    ).toBe(401);
  });
});

describe("finishing a test checkout", () => {
  it("paid: gives exactly one access, audited, and repeating changes nothing (S1)", async () => {
    const c = await mkCourse();
    const p = await person(h);
    const o = (await buy(p, c.id)).json() as Order;
    const done = await finish(p, o.checkoutRef, "paid");
    expect(done.statusCode).toBe(200);
    expect((done.json() as Order).status).toBe("paid");
    expect(await enrolled(p, c.id)).toBe(true);
    await finish(p, o.checkoutRef, "paid");
    await event({
      id: `test_evt_${o.id}_paid`,
      type: "paid",
      checkoutRef: o.checkoutRef,
      amountCents: 4900,
    });
    expect(await active(p.id, c.id)).toBe(1);
    const ent = await h.db.entitlement.findFirstOrThrow({
      where: { userId: p.id, courseId: c.id },
    });
    expect(ent.source).toBe("test_purchase");
    expect(await auditRows(h, { action: "order.paid", targetId: o.id })).toHaveLength(1);
    expect(((await buy(p, c.id)).json() as { code: string }).code).toBe("ALREADY_OWNED");
  });

  it("failed or cancelled: no access, and buying again starts a new checkout (S2)", async () => {
    for (const outcome of ["failed", "cancelled"]) {
      const c = await mkCourse();
      const p = await person(h);
      const o = (await buy(p, c.id)).json() as Order;
      expect(((await finish(p, o.checkoutRef, outcome)).json() as Order).status).toBe(outcome);
      expect(await enrolled(p, c.id)).toBe(false);
      const again = (await buy(p, c.id)).json() as Order;
      expect(again.id).not.toBe(o.id);
      expect(again.status).toBe("pending");
    }
  });

  it("only the buyer can finish their checkout", async () => {
    const c = await mkCourse();
    const p = await person(h);
    const o = (await buy(p, c.id)).json() as Order;
    expect((await finish(await person(h), o.checkoutRef, "paid")).statusCode).toBe(404);
    expect((await h.db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("pending");
    expect(await enrolled(p, c.id)).toBe(false);
    expect((await finish(p, "test_cs_not-a-ref", "paid")).statusCode).toBe(400);
  });
});

describe("provider events", () => {
  it("refuse a bad signature and record unknown orders without effect", async () => {
    const body = { id: `e-${randomUUID()}`, type: "paid", checkoutRef: "test_cs_x" };
    expect((await event(body, "0".repeat(64))).statusCode).toBe(401);
    expect((await event(body, "nonsense")).statusCode).toBe(401);
    expect((await event(body)).json()).toEqual({ outcome: "unknown_order" });
    expect(
      (
        await h.call("POST", "/payments/webhooks/stripe", {
          body,
          headers: { "x-payment-signature": "a".repeat(64) },
        })
      ).statusCode,
    ).toBe(401);
  });

  it("ignore a payment for the wrong amount", async () => {
    const c = await mkCourse();
    const p = await person(h);
    const o = (await buy(p, c.id)).json() as Order;
    expect(
      (
        await event({
          id: `e-${randomUUID()}`,
          type: "paid",
          checkoutRef: o.checkoutRef,
          amountCents: 1,
        })
      ).json(),
    ).toEqual({ outcome: "amount_mismatch" });
    expect(await enrolled(p, c.id)).toBe(false);
  });

  it("apply out-of-order events safely: a late failure after payment is ignored", async () => {
    const c = await mkCourse();
    const p = await person(h);
    const o = (await buy(p, c.id)).json() as Order;
    await event({ id: `e-${randomUUID()}`, type: "paid", checkoutRef: o.checkoutRef });
    expect(
      (await event({ id: `e-${randomUUID()}`, type: "failed", checkoutRef: o.checkoutRef })).json(),
    ).toEqual({ outcome: "ignored" });
    expect(await enrolled(p, c.id)).toBe(true);
  });

  it("a late payment after a failure still gives access (the money was taken)", async () => {
    const c = await mkCourse();
    const p = await person(h);
    const o = (await buy(p, c.id)).json() as Order;
    await event({ id: `e-${randomUUID()}`, type: "failed", checkoutRef: o.checkoutRef });
    expect(
      (await event({ id: `e-${randomUUID()}`, type: "paid", checkoutRef: o.checkoutRef })).json(),
    ).toEqual({ outcome: "paid" });
    expect(await enrolled(p, c.id)).toBe(true);
  });

  it("a reversal ends the access and a won dispute restores it (N01)", async () => {
    const c = await mkCourse();
    const p = await person(h);
    const o = (await buy(p, c.id)).json() as Order;
    await finish(p, o.checkoutRef, "paid");
    expect(
      (
        await event({ id: `e-${randomUUID()}`, type: "reversed", checkoutRef: o.checkoutRef })
      ).json(),
    ).toEqual({ outcome: "reversed" });
    expect(await enrolled(p, c.id)).toBe(false);
    expect(
      (
        await event({ id: `e-${randomUUID()}`, type: "dispute_won", checkoutRef: o.checkoutRef })
      ).json(),
    ).toEqual({ outcome: "paid" });
    expect(await enrolled(p, c.id)).toBe(true);
    expect(await active(p.id, c.id)).toBe(1);
    expect(await auditRows(h, { action: "order.reversed", targetId: o.id })).toHaveLength(1);
  });

  it("flags a payment for a course the person already has, without a second access", async () => {
    const c = await mkCourse();
    const p = await person(h);
    const o = (await buy(p, c.id)).json() as Order;
    await h.db.entitlement.create({
      data: {
        userId: p.id,
        courseId: c.id,
        source: "admin_grant",
        grantReason: "Granted meanwhile",
      },
    });
    expect(
      (await event({ id: `e-${randomUUID()}`, type: "paid", checkoutRef: o.checkoutRef })).json(),
    ).toEqual({ outcome: "duplicate_needs_refund" });
    expect(await active(p.id, c.id)).toBe(1);
  });

  it("give one access when different events for the same payment arrive at once", async () => {
    const c = await mkCourse();
    const p = await person(h);
    const o = (await buy(p, c.id)).json() as Order;
    const res = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        event({ id: `e-${o.id}-${i}`, type: "paid", checkoutRef: o.checkoutRef }),
      ),
    );
    expect(res.every((r) => r.statusCode === 200)).toBe(true);
    expect(await active(p.id, c.id)).toBe(1);
    expect((await h.db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("paid");
  });

  it("store each event once, even when the same event arrives many times at once", async () => {
    const c = await mkCourse();
    const p = await person(h);
    const o = (await buy(p, c.id)).json() as Order;
    const id = `e-${randomUUID()}`;
    await Promise.all(
      Array.from({ length: 5 }, () => event({ id, type: "paid", checkoutRef: o.checkoutRef })),
    );
    expect(await h.db.paymentEvent.count({ where: { eventId: id } })).toBe(1);
    expect(await active(p.id, c.id)).toBe(1);
    // A repeat answers what the first delivery did, not a fresh evaluation.
    expect((await event({ id, type: "paid", checkoutRef: o.checkoutRef })).json()).toEqual({
      outcome: "paid",
    });
  });
});

describe("purchase history and staff view", () => {
  it("lists your own orders newest first in pages, filterable by course", async () => {
    const p = await person(h);
    const cs = [await mkCourse(), await mkCourse(), await mkCourse()];
    for (const c of cs) await buy(p, c.id);
    const first = (
      await h.call("GET", "/me/orders?limit=2", { token: p.accessToken })
    ).json() as Page<Order>;
    expect(first.items).toHaveLength(2);
    const next = (
      await h.call("GET", `/me/orders?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`, {
        token: p.accessToken,
      })
    ).json() as Page<Order>;
    expect([...first.items, ...next.items].map((o) => o.courseId).sort()).toEqual(
      cs.map((c) => c.id).sort(),
    );
    const one = (
      await h.call("GET", `/me/orders?courseId=${cs[0]!.id}`, { token: p.accessToken })
    ).json() as Page<Order>;
    expect(one.items.map((o) => o.courseId)).toEqual([cs[0]!.id]);
    const stranger = await person(h);
    expect(
      (await h.call("GET", `/me/orders/${first.items[0]!.id}`, { token: stranger.accessToken }))
        .statusCode,
    ).toBe(404);
  });

  it("lets staff with payment status see orders by status, and nobody else", async () => {
    const c = await mkCourse();
    const p = await person(h);
    const o = (await buy(p, c.id)).json() as Order;
    await finish(p, o.checkoutRef, "paid");
    const res = (
      await h.call("GET", "/staff/orders?status=paid", { token: manager.accessToken })
    ).json() as Page<StaffOrder>;
    expect(res.items.some((x) => x.id === o.id && x.userId === p.id)).toBe(true);
    expect(res.items.every((x) => x.status === "paid")).toBe(true);
    expect((await h.call("GET", "/staff/orders", { token: p.accessToken })).statusCode).toBe(403);
    expect(
      (await h.call("GET", "/staff/orders", { token: (await person(h, "instructor")).accessToken }))
        .statusCode,
    ).toBe(403);
  });
});
