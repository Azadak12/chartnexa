# Proposal

## Why

Workstream F of the owner's master prompt, within approved scope: ADR-0006 (accepted) defines orders, payment events, idempotency and the entitlement ledger; C17 says payments are a demo built only in test mode with no real charges; N01 says a reversal removes access and a won dispute restores it. The payment strategy itself (Stripe, Apple, Google; ADR-0008) stays pending, so only provider-neutral parts and a test provider are built.

## What Changes

- **Orders:** `POST /me/orders` with an `Idempotency-Key` header starts or resumes buying a published, priced course. The same key returns the same order (a different request with that key is refused); an unfinished checkout for the same course is returned instead of a second one, even under simultaneous requests; owned courses (`ALREADY_OWNED`) and free courses (`COURSE_FREE`, Q34) are refused.
- **Events:** `POST /payments/webhooks/:provider` accepts signed events. Each `(provider, event id)` is stored once; one transaction locks the order and applies the state machine: paid (from pending, failed or cancelled), failed and cancelled (from pending), reversed (from paid, revoking the access it gave), dispute won (from reversed, restoring access). Other combinations are ignored. A payment whose amount does not match is ignored. A payment for a course the person already has becomes `duplicate_needs_refund` without a second access (Q19). Repeated deliveries answer the first outcome.
- **Test provider:** checkouts are references the buyer completes with `POST /payments/test/checkouts/:ref/complete` (paid, failed or cancelled), which sends a signed event through the same webhook handling. `PAYMENT_PROVIDER=test` is refused in production.
- **History:** `GET /me/orders` (paged, by course) and `GET /me/orders/:id`; staff with `payments:read_status` see `GET /staff/orders` by status, without card or personal payment data.
- **App:** the course page offers "Buy for $49.00" with "Test mode: no money is charged", or "Finish your purchase" for an unfinished checkout; a full-screen test checkout (pay, simulate failure, cancel, try again, go to course); Profile, then Purchases.
- **Not included:** Stripe, Apple or Google integration, receipts, taxes, refunds initiated by the academy (C15 forbids), operator tools for duplicates, raw-body signature checking for real providers.

## Capabilities

### New Capabilities
- `payments`, `mobile-purchases`.

## Impact

- Tables `orders`, `payment_events`; entitlement sources extended (`test_purchase`, and reserved `stripe`, `apple`, `google`). Config `PAYMENT_PROVIDER`, `PAYMENT_TEST_WEBHOOK_SECRET`. No new dependencies.
