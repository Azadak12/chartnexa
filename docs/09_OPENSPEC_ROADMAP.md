# OpenSpec implementation roadmap (revised by `establish-architecture-baseline`)

**Status: Proposed, awaiting owner approval.** Owner decisions C12-C15 (mobile-only, USA/Canada, no payouts, no refunds) are applied. Process one change at a time: scope, proposal/spec/design/tasks, owner review, implementation, tests, verification, archive. Never create all changes at once. Order below fixes two draft problems: entitlements and staff authoring now come before the learner player and payments.

Scenario references S1-S10 are the ten critical integration scenarios in `08_QUALITY_AND_TESTING.md`, numbered in order.

## Status on 2026-11-19
Per-change detail is in `docs/12_PROGRESS.md`; integration blockers are in `docs/operations/production-dependencies.md`.
- **Phases 1 to 4:** built and archived. Exceptions: `video-processing-integration` has a test adapter only (Q09); publication rules in `course-lifecycle` are pending (R14).
- **Phase 5:** `payments-core-and-ledger` is built in test mode only (C17). `stripe-web-checkout`, store billing and `reversals-reconciliation` stay blocked on `define-payment-strategy`.
- **Phase 6:** scheduling, joining and cancelling are built as one change, `live-sessions-schedule`, with a manual meeting-link adapter (R38). A hosted provider is blocked on Q03.
- **Phase 7:** built and archived.
- **Phase 8:** `audit-viewer`, the order-status list and `announcements` (in-app only, R39) are built. `ops-lists-reports` and `reports-scoped-access` wait on owner report metrics.
- **Phase 9:**
  - `security-review`: an internal code review is done (`docs/security/2026-11-19-security-review.md`); an independent review is still required.
  - `load-capacity`: tooling ready, run only on a development container (`docs/operations/load-testing.md`).
  - `backup-restore-drill`: scripts drilled locally (`docs/operations/backup-and-restore.md`).
  - `a11y-device-qa`, `store-compliance` and `runbooks-and-staged-release` need devices, accounts and hosting.

## Phase 0: Architecture before code
| Change | Depends on | Acceptance / negative cases |
|---|---|---|
| `establish-architecture-baseline` | none | Docs/ADRs only; every ADR Proposed until owner accepts. |
| `define-payment-strategy` (decision only) | ADR-0008, Q02, Q13 | Owner-approved strategy recorded. Gates Phase 5. |

## Phase 1: Engineering foundations
| Change | Depends on | Acceptance / negative cases |
|---|---|---|
| `bootstrap-monorepo-ci` | baseline approved | Lint, typecheck, tests green in CI; lockfile enforced; no secrets in repo. |
| `api-foundation` | bootstrap | Health endpoint, error envelope, request IDs, migrations apply and roll back. |
| `mobile-shell-and-tokens` | bootstrap | Back-stack and returnTo behavior (S8), brand tokens, contrast and text-scaling tests. |
| `observability-baseline` | api-foundation | Trace/log correlation; no PII in logs (tested). |

## Phase 2: Identity and authorization
| Change | Depends on | Acceptance / negative cases |
|---|---|---|
| `auth-accounts-sessions` | api-foundation | Token rotation and reuse detection, expired session, disabled account, reset abuse rate limited. In-app account deletion. |
| `rbac-core-and-audit` | auth | First-Admin bootstrap (Q14); negative authz tests; append-only audit. |
| `instructor-permission-delegation` | rbac | **S5**: Manager self-escalation blocked and logged; revocation effective; delegation ceiling enforced. |
| `staff-mfa` | auth | Admin/Manager require TOTP; lost-device recovery path. |

## Phase 3: Teaching inventory and entitlement core
| Change | Depends on | Acceptance / negative cases |
|---|---|---|
| `categories-and-course-crud` + `course-lifecycle` | rbac | State machine and who may transition; ownership enforced; unassigned instructor denied. |
| `curriculum-crud` | course crud | Ordering, no orphans, concurrent reorder. |
| `asset-upload-pipeline` | curriculum | Allowlist + MIME/content check, scan, size limits, resumable, **S4**: re-auth at finalize after unassignment. |
| `video-processing-integration` | asset pipeline, Q09 | Transcode status, failure and retry states. |
| `entitlements-core` (`admin_grant` source only) | rbac | One active entitlement per (user, course); revoke/restore; audit. |
| `staff-authoring-surface` (mobile, per C12) | course/curriculum/assets | Pagination, no fetch-all (**S9**); unauthorized states. |

## Phase 4: Discovery and learner experience
| Change | Depends on | Acceptance / negative cases |
|---|---|---|
| `catalog-and-search` | course crud | Stable cursor pagination, cache invalidation, query cost checked. |
| `course-detail-and-library` | catalog, entitlements-core | Buy vs Continue states; preserved scroll and filters (**S8**). |
| `player-resources-progress` | assets, entitlements-core | **S3**: no entitlement denied by backend and signed source; **S7**: expired link, interrupted media, unsupported file; **S10**: safe retry, no duplicate progress writes. |

## Phase 5: Transactions (gated on `define-payment-strategy`)

**Owner decision C17: payments are demo-only for now.** Build in test/sandbox mode with test keys, clearly labeled demo purchases, no real charges. `define-payment-strategy` and store compliance are required before any real-money launch.
| Change | Depends on | Acceptance / negative cases |
|---|---|---|
| `payments-core-and-ledger` | strategy, entitlements-core | **S1**: duplicate event gives one entitlement; **S2**: pending/failed gives no access and reopen restores state; reordered events; cross-channel duplicate (Q19). |
| `stripe-web-checkout` | ledger | Only if approved by strategy. Signature verification, idempotency keys. |
| `store-billing-ios` / `store-billing-android` | ledger | Only if approved. Server notifications, restore purchases, sandbox only until validated. |
| `reversals-reconciliation` (renamed; no academy refunds per C15) | ledger, N01 | Store refunds and chargebacks handled per approved N01 policy; reconciliation report; no refund UI. |

## Phase 6: Live sessions (provider unselected, Q03)
`live-sessions-schedule`, `live-sessions-join`, `live-sessions-cancel`: provider interface, permission scope (`live:schedule:assigned`), cancellation/missed-class messaging, recording policy as approved.

## Phase 7: Reviews and moderation
| Change | Depends on | Acceptance / negative cases |
|---|---|---|
| `reviews-submit` | entitlements-core | **S6**: concurrent submits give one active review and consistent aggregate; ineligible student denied. |
| `reviews-list-edit` | submit | Sorting, pagination, edit/delete, aggregate recalculated atomically. |
| `reviews-moderation` | list-edit | Report/hide with audited reason; no suppression solely for negative rating; Manager cannot rewrite a review. |

## Phase 8: Manager/Admin operations
`ops-lists-reports`, `audit-viewer`, `announcements`, `reports-scoped-access`: pagination and filters (**S9**), Manager financial visibility limits per Q06.

## Phase 9: Production validation
`security-review`, `a11y-device-qa`, `load-capacity`, `backup-restore-drill`, `store-compliance`, `runbooks-and-staged-release`. Evidence recorded for each. Only after this may any readiness claim be made; capacity targets come from measured tests.

## Scenario coverage check
S1, S2: ledger. S3, S7, S10: player. S4: asset pipeline. S5: delegation. S6: reviews-submit. S8: shell and detail. S9: staff surface and ops lists.

## Change template
Each change must include: context and requirements; confirmation status; user stories; role matrix; API/data impact; threat model; UX navigation and states; edge-case table; acceptance tests; performance checks; migration/rollback; tasks; explicit out-of-scope. Use the installed OpenSpec commands and schema.
