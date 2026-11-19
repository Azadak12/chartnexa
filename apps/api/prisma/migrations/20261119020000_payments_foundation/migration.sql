-- Purchases may now grant access too (test mode only for now; store and card providers later).
ALTER TABLE "entitlements" DROP CONSTRAINT "entitlements_source_known";
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_source_known" CHECK ("source" IN ('admin_grant', 'test_purchase', 'stripe', 'apple', 'google'));

-- One attempt to buy one course. The order, not the payment status, links to the access it gave.
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "entitlement_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "reversed_at" TIMESTAMPTZ(6),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_course_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_entitlement_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "entitlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_known" CHECK ("status" IN ('pending', 'paid', 'failed', 'cancelled', 'reversed', 'duplicate_needs_refund'));
ALTER TABLE "orders" ADD CONSTRAINT "orders_amount_positive" CHECK ("amount_cents" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_has_time" CHECK ("status" NOT IN ('paid', 'reversed', 'duplicate_needs_refund') OR "paid_at" IS NOT NULL);
CREATE UNIQUE INDEX "orders_provider_ref_key" ON "orders"("provider", "provider_ref");
-- A retried request with the same key returns the same order.
CREATE UNIQUE INDEX "orders_user_idempotency_key" ON "orders"("user_id", "idempotency_key");
-- At most one unfinished checkout per person and course; reopening the app finds it.
CREATE UNIQUE INDEX "orders_one_pending" ON "orders"("user_id", "course_id") WHERE "status" = 'pending';
CREATE INDEX "orders_user_created_idx" ON "orders"("user_id", "created_at" DESC, "id" DESC);
CREATE INDEX "orders_status_created_idx" ON "orders"("status", "created_at" DESC, "id" DESC);

-- Every provider event once, whatever order or how often it arrives.
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order_id" UUID,
    "outcome" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_events_provider_event_key" ON "payment_events"("provider", "event_id");
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
