# ADR-0008: Payment strategy (options only, no commitment)

- **Status:** Proposed. **No implementation until the owner approves a strategy.**
- **Date:** 2026-11-17
- **Related:** C09, P09, Q02, Q13, X01, X03

## Context
Stripe one-time payments are the stated preference. Apple and Google may require their own billing for digital courses sold inside the app, depending on country, program and app classification. Rules have changed repeatedly, so current Apple and Google terms must be re-read at decision time. Nothing here is legal advice.

## Options
| | Description | Fit with Stripe | Store risk | Cost / effort |
|---|---|---|---|---|
| A | Store billing in-app (Apple IAP, Google Play Billing) | None | Lowest | Store commission; one IAP product per course, so instructor-created courses need product sync via store APIs |
| B | Stripe on web only; app unlocks via login | Full | Medium; app must not steer users in prohibited regions | Lowest fees; weaker mobile conversion |
| C | Stripe through external-link or alternative-billing programs where allowed | Partial | Varies by region and changes often | Per-region logic, compliance reading |
| D | Hybrid of A + B (+ C where legal), one ledger | Partial | Managed | Highest complexity; fits all markets |

All options feed the single entitlement ledger (ADR-0006) through Stripe webhooks, Apple server notifications and Google real-time developer notifications.

## Decision
None yet. Blocking questions: (1) launch countries and storefronts; (2) is the commission acceptable or is web-only acceptable; (3) legal entity and developer-account eligibility for external-purchase programs; (4) instructor payout model (Q13).

## Consequences
Phase 5 changes (`payments-core-and-ledger` and later) are gated on this ADR being Accepted. Earlier phases are not blocked.

## Update 2026-11-17
Owner decisions: markets are USA and Canada (C13); no instructor payouts, all money goes to the organization/Admin (C14); no academy refunds, lifetime access once paid (C15). Effects:
- Single merchant account, no payout or Connect-style design; Q13 closed.
- Stripe is still eligible only where the app-store rules allow it for the chosen market; the US and Canada differ and the rules change, so current Apple and Google terms must be re-read before choosing (N03). Option D (hybrid) remains the most likely fit but is not chosen.
- Refund handling is limited to store- or network-initiated reversals (N01); legality of the strict no-refund policy needs legal review (N02).
Status remains Proposed. No implementation yet.

## Update 2026-11-17 (round 2)
C17: payments are a demo for now. Build only in test/sandbox mode; no real charges. The options analysis above stays on record for the pre-launch decision. N02 and N03 are deferred until a real-money launch.
