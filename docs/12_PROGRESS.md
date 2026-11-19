# Progress tracker

Updated with each OpenSpec change. Three separate measures; none of them is a production-readiness claim.

- **Feature implementation:** which roadmap changes have code merged.
- **Verification:** what automated checks and CI prove for them, and what has never been checked (devices, load, restore).
- **Production readiness:** not assessed. It needs Phase 9 evidence (security review, device QA, load test, backup and restore drill, store compliance), none of which has been executed.

## Roadmap changes (docs/09)

Status values: **Archived** (built, verified, CI green, OpenSpec archived), **Built** (merged, awaiting archive), **In progress**, **Not started**, **Blocked** (named external dependency or owner decision).

| Phase | Change | Status | Notes |
|---|---|---|---|
| 0 | establish-architecture-baseline | Archived | |
| 0 | define-payment-strategy | Blocked | Owner decision (ADR-0008, Q02, Q13); gates Phase 5 provider work |
| 1 | bootstrap-monorepo-ci | Archived | |
| 1 | api-foundation | Archived | |
| 1 | mobile-shell-and-tokens | Archived | Also `mobile-auth` archived |
| 1 | observability-baseline | Archived | CI run 76; Q30, Q31 (tracing SDK, error tracking service) pending |
| 2 | auth-accounts-sessions | Archived | |
| 2 | rbac-core-and-audit | Archived | |
| 2 | instructor-permission-delegation | Archived | Fresh-clone check recorded 2026-11-18 |
| 2 | staff-mfa | Archived | |
| 3 | categories-and-course-crud + course-lifecycle | Partly built | `course-catalog-basics` and `course-categories` archived (CI run 77); publication rules pending decision (R14) |
| 3 | curriculum-crud | Archived | `course-lessons-basic` and `course-modules` archived (CI run 78); lesson types arrive with video |
| 3 | asset-upload-pipeline | Archived (CI runs 79, 80) | `lesson-resources`: checked uploads, scanning boundary, signed links, app screens; production storage and scanning blocked on Q32, Q33 |
| 3 | video-processing-integration | Archived, test adapter only (CI run 81) | `lesson-video`: provider boundary, ranged playback, capped watch progress, 90% completion (R36); production provider blocked on Q09 |
| 3 | entitlements-core | Archived | `admin_grant` source only |
| 3 | staff-authoring-surface | Partly built | Course, lesson and student screens exist |
| 4 | catalog-and-search | Archived | Part of `course-catalog-basics` |
| 4 | course-detail-and-library | Archived | Course page and My Courses |
| 4 | player-resources-progress | Archived (CI runs 80, 81) | Text reader, progress, files (`lesson-resources`) and video (`lesson-video`) |
| 4 | continue-learning (student improvement) | Archived (CI run 86) | Home card with the next lesson of the most recently studied course |
| 5 | payments-core-and-ledger | Archived, test mode only (CI run 82) | `payments-foundation`: orders, events, state machine, reversals, test checkout, purchases screen; real providers blocked on ADR-0008 |
| 5 | stripe-web-checkout | Blocked | Payment strategy |
| 5 | store-billing-ios / store-billing-android | Blocked | Payment strategy and store accounts |
| 5 | reversals-reconciliation | Blocked | Payment strategy and refund policy (N01) |
| 6 | live-sessions-schedule / join / cancel | Archived, manual-link adapter (CI run 83) | `live-sessions-schedule`: scheduling, join window, cancel with reason, staff and student screens (R38); hosted provider blocked on Q03 |
| 7 | reviews-submit / reviews-list-edit | Archived | As `course-reviews-basic` |
| 7 | reviews-moderation | Archived | CI run 75 |
| 8 | audit-viewer, ops-lists (orders) | Archived (CI run 84) | `ops-audit-and-orders`: audit log and order status screens for Admins and Managers |
| 8 | announcements | Built (in-app only), in pull request | `announcements`: post, withdraw, feed, unread count (R39); email and push blocked on Q35 |
| 8 | reports, reports-scoped-access | Not started | Report metrics need owner decisions |
| 9 | security-review, a11y-device-qa, load-capacity, backup-restore-drill, store-compliance, runbooks-and-staged-release | Not started | Device QA and store work need hardware and accounts |

## Latest verified test results

| Date | Scope | Result |
|---|---|---|
| 2026-11-18 | Fresh clone of `main` at `ec6e7a0`: install, lint, format, typecheck, tests, builds, secrets, migration round trip | All pass: 416 API, 420 app, 34 contract |
| 2026-11-18 | CI on `main`, run 75 (`ec6e7a0`) | Success |
| 2026-11-18 | Local full checks after `course-categories` | All pass: 449 API, 427 app, 35 contract |
| 2026-11-18 | CI on `main` runs 77, 78, 79 (categories, modules, files server) | Success |
| 2026-11-19 | Local full checks after `lesson-resources` | All pass: 484 API, 446 app, 37 contract; audit gate passes (2 moderate advisories in Expo tooling) |
| 2026-11-19 | CI on `main` runs 80 to 86 (files app, video, payments, live classes, operations screens, continue learning) | Success |
| 2026-11-19 | Local full checks after `live-sessions-schedule` | All pass: 540 API, 486 app, 40 contract; lint, format, builds, secrets, migration round trip (typecheck re-run after fixing two test option types) |
| 2026-11-19 | Checks after `ops-audit-and-orders` (app only): lint, format, typecheck, app tests, contract tests, app build, secrets | All pass: 493 app, 41 contract |
| 2026-11-19 | Local full checks after `continue-learning` | All pass: 545 API, 495 app, 42 contract; lint, format, typecheck, builds, secrets, migration round trip |

## Never verified

- Any real iOS or Android device, screen readers, large text on a device.
- Load or capacity; no number of supported users can be stated.
- Backup and restore.
- An installable build (needs a working Expo access token; the one saved was rejected).

## Outstanding owner decisions

Payment strategy (ADR-0008, Q02, Q13), video provider (Q09), live provider and live rules (Q03, R38), UX reference use (Q20 to Q22), error tracking and tracing (Q30, Q31), file storage and CDN (Q32), malware scanning (Q33), downloadable resources and Word preview (Q04), deployment arrangement for staff (mobile, web or both).

## Current risks

- Payments are the largest unbuilt area and are blocked on policy.
- Media delivery depends on providers not yet chosen; storage and scanning need accounts.
- No load test: database locks on course rows (reviews, progress) are untested at scale.
