import { z } from "zod";

export const ORDER_STATUSES = [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "reversed",
  "duplicate_needs_refund",
] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const PAYMENT_ERROR_CODES = {
  alreadyOwned: "ALREADY_OWNED",
  notForSale: "NOT_FOR_SALE",
  freeCourse: "COURSE_FREE",
  keyReused: "IDEMPOTENCY_KEY_REUSED",
  testModeOnly: "TEST_MODE_ONLY",
} as const;

export const createOrderRequestSchema = z.strictObject({ courseId: z.uuid() });

/** What the buyer sees. Test mode is always stated; no real money moves in this version. */
export const orderSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  amountCents: z.number().int(),
  currency: z.literal("USD"),
  status: orderStatusSchema,
  provider: z.string(),
  testMode: z.boolean(),
  /** For the provider's checkout (the test provider: its session reference). */
  checkoutRef: z.string(),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
});
export const orderPageSchema = z.object({
  items: z.array(orderSchema),
  nextCursor: z.string().nullable(),
});
export const orderPageQuerySchema = z.strictObject({
  courseId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(512).optional(),
});

export const TEST_CHECKOUT_OUTCOMES = ["paid", "failed", "cancelled"] as const;
export const testCheckoutRequestSchema = z.strictObject({
  outcome: z.enum(TEST_CHECKOUT_OUTCOMES),
});

/** Events the test provider can send; real providers map their events onto these. */
export const PAYMENT_EVENT_TYPES = [
  "paid",
  "failed",
  "cancelled",
  "reversed",
  "dispute_won",
] as const;
export const paymentEventSchema = z.strictObject({
  id: z.string().min(1).max(200),
  type: z.enum(PAYMENT_EVENT_TYPES),
  checkoutRef: z.string().min(1).max(200),
  amountCents: z.number().int().optional(),
});

export const staffOrderSchema = orderSchema.extend({ userId: z.string() });
export const staffOrderPageSchema = z.object({
  items: z.array(staffOrderSchema),
  nextCursor: z.string().nullable(),
});
export const staffOrderQuerySchema = z.strictObject({
  status: orderStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(512).optional(),
});

export type Order = z.infer<typeof orderSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type OrderPageQuery = z.infer<typeof orderPageQuerySchema>;
export type PaymentEventInput = z.infer<typeof paymentEventSchema>;
export type StaffOrder = z.infer<typeof staffOrderSchema>;
export type StaffOrderQuery = z.infer<typeof staffOrderQuerySchema>;
