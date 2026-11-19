# Tasks

- [x] 1.1 Migration with `down.sql` (orders, events, entitlement sources); round trip.
- [x] 1.2 Contracts; provider boundary and test provider refused in production.
- [x] 1.3 Orders with idempotency and one pending checkout; signed events with dedupe, locked state machine, grants, reversals, duplicates; history and staff list; verify 16 integration tests and a config test.
- [x] 1.4 App: buy section, test checkout, purchases; verify 9 component tests (and the updated course page test).
- [x] 1.5 Contract test against the real API; CI route check; mutation checks.
- [ ] 1.6 Full checks; archive after CI passes.

## Evidence

- Process note: specs written alongside the implementation under the owner's autonomous-work instruction.
- Full local checks (step by step): lint, format, builds, typecheck, 522 API tests (17 new), 468 app tests (9 new), 39 contract tests (1 new), builds, secrets, migration round trip: all pass. An existing database test used `stripe` as an example of an unknown entitlement source; ADR-0006 lists it as valid and this migration allows it, so the test now uses `paypal`.
- Mutation checks, all caught after two tests were strengthened: event dedupe removed (survived at first because re-applying was harmless; the test now requires a repeat to answer the first outcome); order lock removed; failure applied after payment; amount not checked; reversal keeping access; signature not checked; owned and free courses purchasable; key reuse not detected; another person finishing a buyer's checkout (survived at first: the stranger got 404 but the payment went through; the test now checks the order stays pending); won dispute not restoring.
- An existing course page test asserted that no buy button exists; it now asserts the test-mode buy button, as this change intends.
- Not verified: any real payment provider, store rules (ADR-0008, Q02), receipts and taxes, devices.
