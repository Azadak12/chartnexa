# Design

1. **Ledger rules (ADR-0006):** access comes only from `entitlements`; the order records the entitlement it created. Granting uses `INSERT ... ON CONFLICT (user_id, course_id) WHERE status = 'active' DO NOTHING`, so the one-active-entitlement rule decides duplicates.
2. **Exactly once:** events are inserted with `ON CONFLICT (provider, event_id) DO NOTHING`; the transition runs in a transaction holding `FOR UPDATE` on the order, so different events for the same payment serialize and only one can grant.
3. **Idempotent create:** `(user_id, idempotency_key)` is unique with a stored request hash; `orders_one_pending` (partial unique) keeps one unfinished checkout per person and course. A unique-violation race returns the winner's order.
4. **Signatures:** the test provider signs the JSON of the event with HMAC-SHA256 (`x-payment-signature`). Real providers sign the raw request body, which needs raw-body capture on the webhook route; that comes with the provider choice.
5. **Transitions:** a table (`TRANSITIONS`) lists every allowed (event, state) pair; anything else is recorded as `ignored`, which makes late and out-of-order events harmless.
