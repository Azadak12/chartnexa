# Quality gates, nonfunctional requirements and tests

## Definition of Done — every implemented OpenSpec change
- Approved spec/design/tasks and explicit acceptance criteria.
- Correct role permissions and ownership; negative authorization tests.
- Valid/invalid inputs and concurrency failures tested.
- Unit + integration tests; critical customer flows have E2E tests.
- Loading, empty, offline, error, retry, permission-denied and success states.
- Navigation/back behavior preserves context where specified.
- Responsive/mobile layouts, text scaling and screen-reader accessibility.
- Instrumented logging/metrics/errors, no secret/PII leakage.
- Performance impact evaluated, regressions fixed, docs/specs updated.
- Actual test evidence recorded; no unverified 'done' claims.

## Critical integration scenarios
1. Purchase verified → exactly one entitlement, payment event duplicated → still one entitlement.
2. Purchase pending/fails → no entitlement, app reopening restores accurate state.
3. Course access request without entitlement → denied by backend and signed asset source.
4. Instructor unassigned mid-edit/upload → forbidden operation, no unauthorized publication.
5. Manager tries privilege escalation → blocked and logged.
6. Student posts concurrent review submissions → one active review, consistent aggregate.
7. Expired file link, interrupted media, unsupported documents → graceful recovery and explanation.
8. Student returns from login/checkout/review modal → prior course, filter and scroll context remains where possible.
9. Large management datasets → pagination, controlled response size, no global fetch-all.
10. App interrupted during slow network → safe retry and no duplicate state transition.

## Performance testing
- Define measured targets only after traffic assumptions: API p50/p95/p99, error rate, uptime, peak concurrent sessions, course catalog size, resource delivery and video bandwidth.
- Run staged load tests for search/catalog, login/session, course details, progress write and authorized resource URLs.
- CDN/video concurrency load requires independent vendor/region validation.
- Backup-restore drills and failure injection/incident runbooks before production.

## Mobile release checks
- iOS and Android builds on actual devices, deep-link and system-back behavior, orientation/video, network switching, notification permissions if used, Store listing/privacy/payment policy review, analytics consent where applicable.
