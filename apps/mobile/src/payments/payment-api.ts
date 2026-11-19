import { orderPageSchema, orderSchema, type Order, type Page } from "@chartnexa/api-contracts";
import { z } from "zod";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "../auth/authed-fetch";

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}
const enc = encodeURIComponent;

/** A new key per purchase attempt, kept across retries of that attempt. */
export const newPurchaseKey = (): string =>
  `buy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** Purchases (test mode only for now: no money moves). The server decides everything. */
export const paymentApi = {
  async createOrder(courseId: string, key: string): Promise<Order> {
    return check(
      orderSchema,
      await authedFetch("/me/orders", {
        method: "POST",
        body: { courseId },
        headers: { "idempotency-key": key },
      }),
    );
  },
  async getOrder(id: string): Promise<Order> {
    return check(orderSchema, await authedFetch(`/me/orders/${enc(id)}`));
  },
  async listOrders(params: { courseId?: string; cursor?: string } = {}): Promise<Page<Order>> {
    const q = [
      params.courseId ? `courseId=${enc(params.courseId)}` : "",
      params.cursor ? `cursor=${enc(params.cursor)}` : "",
    ]
      .filter(Boolean)
      .join("&");
    return check(orderPageSchema, await authedFetch(`/me/orders${q ? `?${q}` : ""}`));
  },
  async completeTestCheckout(
    ref: string,
    outcome: "paid" | "failed" | "cancelled",
  ): Promise<Order> {
    return check(
      orderSchema,
      await authedFetch(`/payments/test/checkouts/${enc(ref)}/complete`, {
        method: "POST",
        body: { outcome },
      }),
    );
  },
};

export const ORDER_STATUS_TEXT: Record<Order["status"], string> = {
  pending: "Not finished",
  paid: "Paid",
  failed: "Payment failed",
  cancelled: "Cancelled",
  reversed: "Payment reversed, access removed",
  duplicate_needs_refund: "Paid twice, the academy will contact you",
};
