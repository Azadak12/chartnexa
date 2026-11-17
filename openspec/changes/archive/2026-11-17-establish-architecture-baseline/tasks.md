# Tasks

## 1. Decision register and audit

- [x] 1.1 Update `docs/10_DECISION_REGISTER.md` with the Confirmed/Proposed/Pending/Contradictions matrix and new questions (instructor payouts, first-Admin bootstrap, staff MFA, regulatory disclaimers, tax, support/refunds); verify every proposed item is labeled Proposed and none moved to Confirmed.
- [x] 1.2 Record non-blocking defaults (Q03, Q04, Q06-Q12) as proposals; verify each has a "needs owner approval" marker.

## 2. ADRs

- [x] 2.1 Create `docs/adr/` with template (Status, Context, Decision, Alternatives, Consequences); verify every ADR starts at Status: Proposed.
- [x] 2.2 Write ADRs for stack, modular monolith, data layer, auth, authorization/delegation, entitlement ledger and idempotency, media delivery, observability; verify each lists alternatives considered.
- [x] 2.3 Write payment-strategy ADR comparing options A-D with no implementation commitment; verify it names the blocking questions and the instructor payout gap.
- [x] 2.4 Write UX navigation policy ADR (sheets vs full screens, back behavior, returnTo, states, accessibility); verify it maps to the doc 03 rules.

## 3. Roadmap

- [x] 3.1 Rewrite `docs/09_OPENSPEC_ROADMAP.md` with the corrected phased change list, dependencies, and per-change acceptance/negative cases; verify each change is independently testable and no mega-change remains.
- [x] 3.2 Add the doc 08 critical scenarios to the roadmap entries they belong to; verify all ten scenarios are assigned.

## 4. OpenSpec configuration

- [x] 4.1 Fill `openspec/config.yaml` context (stack proposals, confirmed vs proposed rule, no-capacity-claims, brand, payment gate) and per-artifact rules (change template from doc 09, status labels); verify `openspec status --change establish-architecture-baseline` still works.

## 5. Review

- [x] 5.1 Run `openspec validate establish-architecture-baseline`; verify it passes.
- [x] 5.2 Present the baseline to the product owner and record their decisions; verify no ADR is Accepted without explicit approval.

## Workflow follow-up

- After approval, archive this change, then propose `bootstrap-monorepo-ci`.
