# Decision register — do not fill gaps with assumptions

## Confirmed (user/client discussion)
| ID | Decision |
|---|---|
| C01 | Temporary brand: ChartNexa Academy |
| C02 | Color system: White overall, black text, blue icons and CTAs |
| C03 | iOS and Android mobile app |
| C04 | Roles: Student, Instructor, Manager, Admin |
| C05 | Admin has system control; Manager manages daily operations |
| C06 | Instructor permissions individually controlled by Admin/authorized Manager |
| C07 | Live and recorded lectures optional |
| C08 | Videos/images/PDF/Word and other approved materials |
| C09 | One-time purchase model, Stripe desired |
| C10 | Lifetime access after verified purchase |
| C11 | Eligible students rate and review courses |

## Recommended but not yet approved
| ID | Decision / proposal |
|---|---|
| P01 | React Native + Expo + TypeScript |
| P02 | NestJS API, PostgreSQL/Prisma, modular monolith |
| P03 | Next.js web dashboard for heavy management workflows |
| P04 | S3 storage/CDN, dedicated streaming platform |
| P05 | Redis/BullMQ as operational demand dictates |
| P06 | Inter typography, blue `#2563EB`, black `#111111`, white `#FFFFFF` |
| P07 | One review per enrolled student per course; edit/delete and moderation |
| P08 | Learning progress tracking, previews, notices, profile/receipts |
| P09 | Stripe web checkout plus app-store-compliant mobile billing and centralized entitlement layer |

## Pending — needs approval before relevant implementation
| ID | Question / risk |
|---|---|
| Q01 | Do Admin, Manager, Instructor work on mobile only, web only, or both? |
| Q02 | Which countries/markets and store distribution? What exact compliant digital purchase method? |
| Q03 | Live session provider, attendance rules, recordings and cancellation rules? |
| Q04 | Which uploaded resource types can students download vs only view? Limits/DRM? |
| Q05 | What does lifetime access mean after refunds, chargebacks, course takedown, account sanctions? |
| Q06 | Exact delegated permissions of Managers; instructor-permission review/approval rules? |
| Q07 | Which lesson completion and progress rules? |
| Q08 | Quizzes, certificates, student discussion, messaging, trading charts in MVP? |
| Q09 | Hosting provider/region, video bandwidth budget, expected concurrent users, SLOs? |
| Q10 | Languages, accessibility needs, regulatory disclosures and privacy jurisdictions? |
| Q11 | Are there existing users/course assets to migrate? |
| Q12 | Final brand name/logo/trademark and app store publisher accounts? |

Do not block harmless architecture analysis for unresolved questions. For implementation decisions with legal/store/payment/security implications, pause and request approval.

---

## Architecture baseline audit (added by change `establish-architecture-baseline`, 2026-11-17)

Status of everything below: **Proposed or Pending. Nothing here is Confirmed** until the product owner approves it.

### Contradictions and gaps found in the document package
| ID | Finding | Effect |
|---|---|---|
| X01 | C09 (Stripe desired) vs app-store billing rules for in-app digital purchases | Payment strategy must be approved before any checkout code. See ADR-0008. |
| X02 | C03 says "iOS and Android app" but Q01 leaves staff-role platform open; CLAUDE.md narrows the confirmed part to student-facing | Decides whether a staff web app is built early. |
| X03 | No instructor revenue-share or payout model anywhere (marketplace is only proposed) | Shapes payments schema, tax and refund liability. See Q13. |
| X04 | Roadmap put the learner player (needs entitlements) before payments/entitlements, and admin tooling after course creation | Roadmap reordered in doc 09. |
| X05 | Manager "permitted payment statuses" vs "no unrestricted sensitive financial data" | Boundary must be defined (Q06). |
| X06 | Lifetime access (C10) has no defined exceptions; review eligibility depends on it | Q05. |
| X07 | Student accounts are only marked [P] although every flow needs them; both stores require in-app account deletion | Treated as required; confirm scope. |

### Additional pending questions
| ID | Question / risk | Status |
|---|---|---|
| Q13 | Instructor compensation: employee, revenue share, Stripe Connect payouts, or none? | Pending. Blocks payments schema (Phase 5), not earlier phases. |
| Q14 | First-Admin bootstrap procedure and recovery if the only Admin is locked out? | Pending. Needed by `rbac-core-and-audit`. |
| Q15 | MFA for Admin/Manager (proposed: TOTP required)? | Proposed. |
| Q16 | Regulatory/disclaimer needs for trading education (risk disclosure, "no investment advice" wording), by jurisdiction? | Pending. Needs legal input; not decided by engineering. |
| Q17 | Tax/VAT handling and invoices/receipts? | Pending. |
| Q18 | Support channel and refund-request flow? | Pending. |
| Q19 | If a student buys the same course on two channels (web and store), policy for the duplicate? | Proposed: second order flagged `duplicate_needs_refund` for operator action. Needs approval. |

### Proposed defaults for non-blocking unknowns (all NEED OWNER APPROVAL)
| Ref | Proposed default | Revisit when |
|---|---|---|
| Q03 | Choose live provider at Phase 6 behind a provider interface | Before `live-sessions-*` |
| Q04 | Per-resource `downloadable` flag, default off; video stream-only; Word shown as PDF preview | Before `asset-upload-pipeline` |
| Q06 | Managers can delegate only a subset that Admin defines; no self-escalation; every change audited | Before `instructor-permission-delegation` |
| Q07 | Lesson complete at >=90% watched; manual mark for non-video lessons | Before `player-resources-progress` |
| Q08 | Quizzes, certificates, community, chat, trading charts excluded from first release | Before Phase 3 |
| Q09 | SLO/capacity targets are placeholders until traffic and budget are known; no capacity claims | Before load tests |
| Q10 | English first, localization-ready layout, WCAG 2.1 AA target | Before `mobile-shell-and-tokens` |
| Q11 | Assume no existing users or content to migrate | Before Phase 2 |
| Q12 | Keep placeholder brand/logo until legal clearance; developer accounts needed before store builds | Before store submission |

### Proposals that remain unapproved (P01-P09 unchanged)
P01-P09 above are still **Recommended, not approved**. ADRs in `docs/adr/` record them with Status: Proposed.

---

## Owner decisions recorded 2026-11-17 (stated by the product owner in chat)

| ID | Decision | Resolves / affects |
|---|---|---|
| C12 | **All roles (Student, Instructor, Manager, Admin) use the mobile app.** No staff web app for now. | Resolves Q01. ADR-0003 deferred; roadmap `staff-authoring-surface` becomes mobile. |
| C13 | **Launch markets: USA and Canada** for now. | Partly answers Q02 (markets). Store billing method still undecided. |
| C14 | **No instructor payouts.** All payments go to the Admin/organization (one organization). | Resolves Q13. No revenue-share or Connect-style payout design needed now. |
| C15 | **No refunds after payment. Once a course is paid, access is lifetime.** | Resolves Q05 for academy-initiated refunds. Store/card-network reversals remain open, see N01. |

Q01, Q05, Q13 are closed. Q02 remains open for the billing method only.

### Follow-ups raised by these decisions (still pending, need owner input or legal review)
| ID | Question | Why it matters |
|---|---|---|
| N01 | Apple, Google and card networks can refund or reverse a purchase regardless of academy policy (store refund, chargeback). What happens to access when that occurs? Proposed: access revoked on a store/dispute reversal, restored if the dispute is won. | C15 cannot prevent these; the entitlement state machine needs a defined behavior. |
| N02 | Is a strict no-refund policy lawful and store-acceptable in the US and Canada (consumer protection, store terms, disclosure at purchase)? | Needs legal review. Engineering will show the policy clearly before purchase but does not decide legality. |
| N03 | Billing method for USA/Canada (ADR-0008 options A-D). External-purchase rules differ between the US and Canada and change over time; current Apple/Google terms must be verified. | Still blocks Phase 5 only. |
| N04 | Do Canadian users require French (Quebec) language support, and tax handling (GST/HST/PST/QST, US sales tax)? | Extends Q10 and Q17. |
| N05 | Mobile-only staff: large video uploads and bulk authoring from a phone. Accept this limitation, or revisit a staff web app later? | Authoring UX risk, see ADR-0003. |

---

## Owner answers recorded 2026-11-17 (second round)

| ID | Decision | Effect |
|---|---|---|
| C16 | Platforms are **Android and iOS** (confirms C03). Web was mentioned in passing and then clarified as not part of the app; no web client. | C03 and C12 stand. |
| C17 | **Payments are a demo for now.** Do not invest heavily in payment compliance yet. | Phase 5 is built in test/sandbox mode only, with no real money and no production store billing. The ledger design (ADR-0006) is still built correctly, since access control depends on it. |
| N01 | Agreed: on a store or dispute reversal, access is revoked and restored if the dispute is won. | Closed. Applies only once real payments exist. |
| N05 | Accepted: staff use mobile only for now, including mobile video upload. | Closed. Revisit if authoring proves too hard. |

### Consequences of C17
- N03 (billing method for USA/Canada) and N02 (no-refund legality) are **deferred, not resolved**. They must be answered before any real-money launch or store submission.
- The earlier offer to research current Apple/Google rules is parked until then.
- Demo checkout must be clearly labeled as a demo/test purchase in the UI and must never charge real cards. Test keys only, per CLAUDE.md.
- N04 (French/Quebec, tax) is also deferred to pre-launch.
