# Proposal

## Why

ChartNexa Academy has a document package (README, CLAUDE.md, docs/01-10) but no approved architecture. Several items are contradictory or unresolved (Stripe-only preference vs app-store billing rules, staff-role platform, instructor payouts, lifetime-access exceptions). Building code before these are recorded risks rework in payments, entitlements and permissions, which are the hardest areas to change later. This change records the architecture baseline for review; no application code is written.

## What Changes

- Record the Confirmed / Proposed / Pending / Contradictions matrix in the decision register, including gaps found in the audit (instructor payout model, first-Admin bootstrap, staff MFA, regulatory disclaimers, tax, support/refund flow).
- Write ADRs for: stack (RN+Expo, NestJS modular monolith, PostgreSQL+Prisma), staff web (Next.js, conditional on Q01), auth approach, authorization/delegation model, entitlement ledger, media delivery, payment strategy options, observability, UX navigation policy.
- Replace the draft roadmap in `docs/09_OPENSPEC_ROADMAP.md` with a corrected, phased list of small changes (entitlement core and staff authoring moved earlier than payments and Phase 8).
- Fill `openspec/config.yaml` with project context and per-artifact rules.
- Identify the minimum product-owner decisions and record non-blocking defaults explicitly as **proposals**.
- **No application code, no package installs, no payment implementation.** Nothing proposed here becomes "confirmed" without owner approval.

## Capabilities

### New Capabilities
<!-- None: documentation and planning only. No spec-level product behavior changes; behavior specs are authored in later changes. -->

### Modified Capabilities
<!-- None -->

## Impact

- Files: `docs/10_DECISION_REGISTER.md`, `docs/09_OPENSPEC_ROADMAP.md`, new `docs/adr/*.md`, `openspec/config.yaml`.
- No APIs, dependencies, or running systems affected.
- Gates: Phase 1 (`bootstrap-monorepo-ci`) starts only after this baseline is reviewed and approved. Payment changes additionally require the payment-strategy decision.
- Out of scope: any code, schemas in Prisma, CI setup, store-account setup, legal advice.
