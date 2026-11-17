# Design

## Context

Starting state: planning docs only, empty OpenSpec scaffold. See proposal.md for motivation. Constraints: P01-P09 are recommendations, not approvals; scale numbers are design targets, not demonstrated capacity; store payment policy (verify current Apple/Google terms at decision time) limits Stripe use inside apps.

## Goals / Non-Goals

**Goals:** a reviewable ADR set, a corrected roadmap of small independently testable changes, and a minimal list of owner decisions.
**Non-Goals:** code, package selection by installation, payment/legal conclusions, capacity claims.

## Decisions

1. **Modular monolith (NestJS) over microservices or BaaS.** Complex entitlement and permission logic and a small team favor one deployable with enforced module boundaries (Identity, Authz, Courses, Curriculum, Assets, Orders/Payments, Entitlements, Learning, Reviews, Live, Notifications, Reporting, Audit). Alternatives: microservices (ops cost), Supabase/Firebase (weak for custom authz/ledger).
2. **PostgreSQL + Prisma**, with raw SQL migrations for partial unique indexes, CHECK constraints and row locks. Alternatives: Drizzle/Kysely (more SQL control).
3. **Expo dev builds (EAS)**, not Expo Go, because store-billing libraries are native modules. Alternatives: Flutter, native x2, PWA.
4. **Single entitlement ledger** with `source = stripe | apple | google | admin_grant`. Access is a DB check, never cache or client state. Unique active entitlement per (user, course). Payment events deduped by unique (provider, event_id); order transitions in one transaction with row lock; outbox for side effects.
5. **Authorization:** central `can(actor, action, resource)`. Permission grants scoped by course. Delegation ceiling stored as data: a Manager grants only the intersection of permissions they hold and those delegated to Managers, never to themselves. Permissions not embedded in tokens; short TTL plus per-user authz version. Re-check at upload finalize. Append-only audit.
6. **Auth (proposal, decision needed):** first-party (Argon2id, rotating hashed refresh tokens with reuse detection, Apple/Google OIDC) vs managed IdP (Auth0/Clerk/Cognito; per-MAU cost). Offering third-party login requires Sign in with Apple. TOTP MFA required for Admin/Manager. In-app account deletion required.
7. **Media:** object storage + CDN for files with short-lived signed URLs; managed video provider with signed playback tokens; Word converted to PDF in a sandboxed worker for view-only. Revocation lag equals token TTL; stated honestly. No DRM claim.
8. **Payments (decision pending):** options A store IAP, B Stripe web only, C external-link/alternative billing where legal, D hybrid. Every option feeds the same ledger. One IAP product per course implies product-sync tooling for instructor-created courses. Instructor payout model (employee, revenue share, Stripe Connect) is undecided and shapes the schema.
9. **Cross-channel double purchase:** unique active entitlement blocks the second; the second order goes to a `duplicate_needs_refund` state and flags an operator. Policy needs owner approval.
10. **Review aggregates:** transactional atomic delta on `course_rating_stats` in the same transaction as the review write, plus nightly reconciliation.
11. **Staff web (Next.js):** recommended, phased, conditional on Q01. API stays client-agnostic (OpenAPI, generated clients, single error envelope, cursor pagination).
12. **Redis/BullMQ deferred** until measured need; start with Postgres outbox and simple jobs.
13. **Observability:** OpenTelemetry traces with request IDs from the app, structured PII-scrubbed logs, Sentry, business metrics (webhook-to-entitlement latency, pending-order age, playback token failures, queue depth).
14. **Corrected roadmap order:** entitlements-core (admin_grant) and staff authoring surface precede the learner player; payments follow an approved strategy.

## Risks / Trade-offs

- Store rules invalidate Stripe-only plan -> payment-strategy decision gate before Phase 5; ledger design is source-agnostic.
- Per-course IAP product sync burden -> decide strategy early; consider Option B/C to avoid.
- Undefined instructor payouts -> owner question before payments schema.
- Video bandwidth cost dominates -> provider choice with spend alerts; capacity validated by load tests, not asserted.
- Delegation bugs (privilege escalation) -> negative tests and audit in the first authz change.
- Trading-content regulatory and store scrutiny -> disclaimers and legal review tracked as tasks.
- Recommendations treated as approvals -> every ADR carries a Status field; only the owner moves it to Accepted.

## Open Questions (safe to defer)

- Final cloud provider and region (Q09), live provider (Q03), languages (Q10), migration of existing data (Q11).
