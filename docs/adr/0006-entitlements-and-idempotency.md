# ADR-0006: Entitlement ledger, idempotency and concurrency

- **Status:** Accepted (owner, 2026-11-17)
- **Date:** 2026-11-17
- **Related:** C10, Q05, Q19, doc 06

## Context
Access must come only from verified purchases (or admin grants), exactly once, even with duplicate, delayed or reordered provider events.

## Decision
- Separate records: orders, payment attempts, payment events, entitlements, progress.
- `entitlements.source` is one of `stripe | apple | google | admin_grant`; status `active | revoked | suspended` with reason and timestamps.
- Partial unique index: one active entitlement per (user, course).
- Payment events deduped by unique (provider, event_id); client-initiated POSTs require an Idempotency-Key stored with a request hash.
- Webhook handling: verify signature, insert event idempotently, then one transaction: lock order row, apply state-machine transition, create entitlement, write outbox row. Re-fetch provider objects rather than trusting event order.
- Access checks always read the database; no cache may grant access.
- Cross-channel duplicate purchase: second order goes to `duplicate_needs_refund` and flags an operator (needs approval, Q19).

## Alternatives considered
- Payment status as the authorization source: breaks with refunds and multiple channels.
- Cache-backed access checks: stale grants.

## Consequences
Raw SQL migrations for partial unique indexes and locks. Refund/chargeback semantics wait on Q05 but statuses are modeled now.

## Update 2026-11-17
C15: no academy refunds and lifetime access once paid. The `revoked` status is kept only for store/dispute reversals and admin sanctions, pending N01. Academy-initiated refund flows are not built; `refunds-reconciliation` is reduced to handling store and dispute reversals.
