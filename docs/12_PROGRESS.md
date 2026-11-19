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
| 3 | asset-upload-pipeline | Built, awaiting CI | `lesson-resources`: checked uploads, scanning boundary, signed links, app screens; production storage and scanning blocked on Q32, Q33 |
| 3 | video-processing-integration | Built (test adapter), awaiting CI | `lesson-video`: provider boundary, ranged playback, capped watch progress, 90% completion (R36); production provider blocked on Q09 |
| 3 | entitlements-core | Archived | `admin_grant` source only |
| 3 | staff-authoring-surface | Partly built | Course, lesson and student screens exist |
| 4 | catalog-and-search | Archived | Part of `course-catalog-basics` |
| 4 | course-detail-and-library | Archived | Course page and My Courses |
| 4 | player-resources-progress | Built, awaiting CI | Text reader, progress, files (`lesson-resources`) and video (`lesson-video`) |
| 5 | payments-core-and-ledger | Not started | Provider-neutral parts can start; provider parts blocked |
| 5 | stripe-web-checkout | Blocked | Payment strategy |
| 5 | store-billing-ios / store-billing-android | Blocked | Payment strategy and store accounts |
| 5 | reversals-reconciliation | Blocked | Payment strategy and refund policy (N01) |
| 6 | live-sessions-schedule / join / cancel | Not started | Live provider not chosen (Q03); scheduling can start |
| 7 | reviews-submit / reviews-list-edit | Archived | As `course-reviews-basic` |
| 7 | reviews-moderation | Archived | CI run 75 |
| 8 | ops-lists-reports, audit-viewer, announcements, reports-scoped-access | Not started | Audit API exists; no viewer screen |
| 9 | security-review, a11y-device-qa, load-capacity, backup-restore-drill, store-compliance, runbooks-and-staged-release | Not started | Device QA and store work need hardware and accounts |

## Latest verified test results

| Date | Scope | Result |
|---|---|---|
| 2026-11-18 | Fresh clone of `main` at `ec6e7a0`: install, lint, format, typecheck, tests, builds, secrets, migration round trip | All pass: 416 API, 420 app, 34 contract |
| 2026-11-18 | CI on `main`, run 75 (`ec6e7a0`) | Success |
| 2026-11-18 | Local full checks after `course-categories` | All pass: 449 API, 427 app, 35 contract |
| 2026-11-18 | CI on `main` runs 77, 78, 79 (categories, modules, files server) | Success |
| 2026-11-19 | Local full checks after `lesson-resources` | All pass: 484 API, 446 app, 37 contract; audit gate passes (2 moderate advisories in Expo tooling) |

## Never verified

- Any real iOS or Android device, screen readers, large text on a device.
- Load or capacity; no number of supported users can be stated.
- Backup and restore.
- An installable build (needs a working Expo access token; the one saved was rejected).

## Outstanding owner decisions

Payment strategy (ADR-0008, Q02, Q13), video provider (Q09), live provider (Q03), UX reference use (Q20 to Q22), error tracking and tracing (Q30, Q31), file storage and CDN (Q32), malware scanning (Q33), downloadable resources and Word preview (Q04), deployment arrangement for staff (mobile, web or both).

## Current risks

- Payments are the largest unbuilt area and are blocked on policy.
- Media delivery depends on providers not yet chosen; storage and scanning need accounts.
- No load test: database locks on course rows (reviews, progress) are untested at scale.
