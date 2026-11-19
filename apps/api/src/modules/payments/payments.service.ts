import { createHash } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  DEFAULT_PAGE_SIZE,
  PAYMENT_ERROR_CODES,
  type Order,
  type OrderPageQuery,
  type Page,
  type PaymentEventInput,
  type StaffOrder,
  type StaffOrderQuery,
} from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { buildPage, decodeCursor } from "../../pagination/cursor.js";
import { AuditService } from "../access/index.js";
import { PAYMENT_PROVIDER, TestPaymentProvider, type PaymentProvider } from "./payment-provider.js";

type Tx = Prisma.TransactionClient;
type Row = Prisma.OrderGetPayload<{ include: { course: { select: { title: true } } } }>;
const iso = (d: Date) => d.toISOString();

export function toOrder(o: Row, testMode: boolean): Order {
  return {
    id: o.id,
    courseId: o.courseId,
    courseTitle: o.course.title,
    amountCents: o.amountCents,
    currency: "USD",
    status: o.status as Order["status"],
    provider: o.provider,
    testMode,
    checkoutRef: o.providerRef,
    createdAt: iso(o.createdAt),
    paidAt: o.paidAt ? iso(o.paidAt) : null,
  };
}

/** What each event does to an order in a given state. Anything not listed is ignored. */
export const TRANSITIONS: Record<string, Partial<Record<string, string>>> = {
  paid: { pending: "paid", failed: "paid", cancelled: "paid" },
  failed: { pending: "failed" },
  cancelled: { pending: "cancelled" },
  reversed: { paid: "reversed" },
  dispute_won: { reversed: "paid" },
};

/**
 * Orders, provider events and the access they give (ADR-0006). Access always comes from the
 * entitlements table; an order only records which entitlement it created.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private load(id: string): Promise<Row | null> {
    return this.db.order.findUnique({
      where: { id },
      include: { course: { select: { title: true } } },
    });
  }

  // --- buyers --------------------------------------------------------------------------------

  /**
   * Starts (or resumes) a checkout. The same Idempotency-Key returns the same order; an unfinished
   * checkout for the same course is returned instead of a second one.
   */
  async createOrder(userId: string, courseId: string, idempotencyKey: string): Promise<Order> {
    const requestHash = createHash("sha256").update(JSON.stringify({ courseId })).digest("hex");
    const byKey = await this.db.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: { course: { select: { title: true } } },
    });
    if (byKey) {
      if (byKey.requestHash !== requestHash) {
        throw new ConflictException({
          message: "This request key was already used for a different purchase.",
          code: PAYMENT_ERROR_CODES.keyReused,
        });
      }
      return toOrder(byKey, this.provider.testMode);
    }
    const course = await this.db.course.findUnique({ where: { id: courseId } });
    if (!course || course.status !== "published") {
      throw new NotFoundException({
        message: "Course not found.",
        code: PAYMENT_ERROR_CODES.notForSale,
      });
    }
    if (course.priceCents <= 0) {
      throw new ConflictException({
        message: "This course is free. Ask the academy for access.",
        code: PAYMENT_ERROR_CODES.freeCourse,
      });
    }
    const owned = await this.db.entitlement.findFirst({
      where: { userId, courseId, status: "active" },
    });
    if (owned) {
      throw new ConflictException({
        message: "You already have this course.",
        code: PAYMENT_ERROR_CODES.alreadyOwned,
      });
    }
    const pending = await this.db.order.findFirst({
      where: { userId, courseId, status: "pending" },
      include: { course: { select: { title: true } } },
    });
    if (pending) return toOrder(pending, this.provider.testMode);
    const { ref } = await this.provider.createCheckout(courseId, course.priceCents);
    try {
      const row = await this.db.order.create({
        data: {
          userId,
          courseId,
          provider: this.provider.name,
          providerRef: ref,
          amountCents: course.priceCents,
          idempotencyKey,
          requestHash,
        },
        include: { course: { select: { title: true } } },
      });
      return toOrder(row, this.provider.testMode);
    } catch (e) {
      // A simultaneous request won the race (same key or same pending checkout): return its order.
      if ((e as { code?: string }).code !== "P2002") throw e;
      const again =
        (await this.db.order.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
          include: { course: { select: { title: true } } },
        })) ??
        (await this.db.order.findFirst({
          where: { userId, courseId, status: "pending" },
          include: { course: { select: { title: true } } },
        }));
      if (!again) throw e;
      return toOrder(again, this.provider.testMode);
    }
  }

  async getMine(userId: string, orderId: string): Promise<Order> {
    const o = await this.load(orderId);
    if (!o || o.userId !== userId) throw new NotFoundException("Order not found.");
    return toOrder(o, this.provider.testMode);
  }

  async listMine(userId: string, q: OrderPageQuery): Promise<Page<Order>> {
    return this.page({ userId, ...(q.courseId ? { courseId: q.courseId } : {}) }, q, (o) =>
      toOrder(o, this.provider.testMode),
    );
  }

  async listStaff(q: StaffOrderQuery): Promise<Page<StaffOrder>> {
    return this.page(q.status ? { status: q.status } : {}, q, (o) => ({
      ...toOrder(o, this.provider.testMode),
      userId: o.userId,
    }));
  }

  private async page<T>(
    where: Prisma.OrderWhereInput,
    q: { limit?: number | undefined; cursor?: string | undefined },
    map: (o: Row) => T,
  ): Promise<Page<T>> {
    const limit = q.limit ?? DEFAULT_PAGE_SIZE;
    let cursorWhere: Prisma.OrderWhereInput = {};
    if (q.cursor) {
      const [ts, id] = decodeCursor(q.cursor, this.config.CURSOR_SECRET);
      const at = new Date(String(ts));
      cursorWhere = { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: String(id) } }] };
    }
    const rows = await this.db.order.findMany({
      where: { AND: [where, cursorWhere] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: { course: { select: { title: true } } },
    });
    const page = buildPage(rows, limit, (o) => [iso(o.createdAt), o.id], this.config.CURSOR_SECRET);
    return { items: page.items.map(map), nextCursor: page.nextCursor };
  }

  // --- provider events -----------------------------------------------------------------------

  /**
   * Handles a verified provider event once. The event row is stored first (unique per provider
   * and event id), then one transaction locks the order and applies the transition, granting or
   * revoking access. Repeated, late or out-of-order events change nothing they should not.
   */
  async handleEvent(provider: string, event: PaymentEventInput): Promise<{ outcome: string }> {
    const inserted = await this.db.$queryRaw<{ id: string }[]>`
      INSERT INTO payment_events (id, provider, event_id, type)
      VALUES (gen_random_uuid(), ${provider}, ${event.id}, ${event.type})
      ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`;
    if (inserted.length === 0) {
      const seen = await this.db.paymentEvent.findUnique({
        where: { provider_eventId: { provider, eventId: event.id } },
      });
      return { outcome: seen?.outcome ?? "duplicate" };
    }
    const eventRowId = inserted[0]!.id;
    const outcome = await this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM orders WHERE provider = ${provider} AND provider_ref = ${event.checkoutRef} FOR UPDATE`;
      if (!locked[0]) return "unknown_order";
      const order = await tx.order.findUniqueOrThrow({ where: { id: locked[0].id } });
      await tx.paymentEvent.update({ where: { id: eventRowId }, data: { orderId: order.id } });
      if (
        event.type === "paid" &&
        event.amountCents !== undefined &&
        event.amountCents !== order.amountCents
      ) {
        return "amount_mismatch";
      }
      const next = TRANSITIONS[event.type]?.[order.status];
      if (!next) return "ignored";
      return this.apply(tx, order, event.type, next);
    });
    await this.db.paymentEvent.update({
      where: { id: eventRowId },
      data: { outcome, processedAt: new Date() },
    });
    return { outcome };
  }

  private async apply(
    tx: Tx,
    order: Prisma.OrderGetPayload<object>,
    type: string,
    next: string,
  ): Promise<string> {
    const now = new Date();
    let status = next;
    let entitlementId = order.entitlementId;
    if (next === "paid") {
      // Granting under the course's one-active-entitlement rule: an existing access (another
      // purchase, or a staff grant) makes this a duplicate payment for an operator to settle (Q19).
      const granted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO entitlements (id, user_id, course_id, source, status, grant_reason)
        VALUES (gen_random_uuid(), ${order.userId}::uuid, ${order.courseId}::uuid,
                ${order.provider === "test" ? "test_purchase" : order.provider}, 'active', 'Paid order')
        ON CONFLICT (user_id, course_id) WHERE status = 'active' DO NOTHING RETURNING id`;
      if (granted[0]) entitlementId = granted[0].id;
      else status = "duplicate_needs_refund";
    }
    if (next === "reversed" && order.entitlementId) {
      // N01: a reversal ends the access this order gave; a won dispute gives it back.
      await tx.entitlement.updateMany({
        where: { id: order.entitlementId, status: "active" },
        data: { status: "revoked", revokedAt: now, revokeReason: "Payment reversed" },
      });
    }
    await tx.order.update({
      where: { id: order.id },
      data: {
        status,
        entitlementId,
        ...(next === "paid" ? { paidAt: order.paidAt ?? now } : {}),
        ...(next === "reversed" ? { reversedAt: now } : {}),
      },
    });
    await this.audit.record(tx, {
      actorKind: "system",
      action: `order.${type}`,
      targetType: "order",
      targetId: order.id,
      outcome: "success",
      before: { status: order.status },
      after: { status, courseId: order.courseId, ...(entitlementId ? { entitlementId } : {}) },
    });
    return status;
  }

  // --- test provider -------------------------------------------------------------------------

  private testProvider(): TestPaymentProvider {
    if (!(this.provider instanceof TestPaymentProvider)) {
      throw new ForbiddenException({
        message: "Test checkout is not available.",
        code: PAYMENT_ERROR_CODES.testModeOnly,
      });
    }
    return this.provider;
  }

  /** The buyer finishes a test checkout: the outcome travels as a signed event to the webhook path. */
  async completeTestCheckout(
    userId: string,
    ref: string,
    outcome: "paid" | "failed" | "cancelled",
  ): Promise<Order> {
    const provider = this.testProvider();
    const order = await this.db.order.findFirst({
      where: { provider: provider.name, providerRef: ref },
    });
    if (!order || order.userId !== userId) throw new NotFoundException("Checkout not found.");
    const event: PaymentEventInput = {
      id: `test_evt_${order.id}_${outcome}`,
      type: outcome,
      checkoutRef: ref,
      amountCents: order.amountCents,
    };
    const body = JSON.stringify(event);
    await this.receiveWebhook(provider.name, event, provider.sign(body));
    return this.getMine(userId, order.id);
  }

  /** Webhook entry: the signature must match the event as received. */
  async receiveWebhook(
    providerName: string,
    event: PaymentEventInput,
    signature: string | undefined,
  ): Promise<{ outcome: string }> {
    if (
      providerName !== this.provider.name ||
      !this.provider.verifySignature(JSON.stringify(event), signature)
    ) {
      throw new UnauthorizedException("Invalid signature.");
    }
    return this.handleEvent(providerName, event);
  }
}
