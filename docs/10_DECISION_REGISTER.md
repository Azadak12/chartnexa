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
| Q15 | MFA for Admin/Manager (proposed: TOTP required)? | Approved 2026-11-18 as R21 to R24 (`staff-mfa`). |
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

---

## Owner decisions recorded 2026-11-17 (authentication)

| ID | Decision | Effect |
|---|---|---|
| C18 | **First-party authentication** (email and password in our own API). | ADR-0004 Accepted. |
| C19 | **Apple and Google sign-in later**, not in the first auth change. | Sign in with Apple is only required once a third-party login is offered. |
| C20 | **Mailer interface with a development-only sender** for verification and reset emails. | A real email provider and sender domain remain open before launch. |

Proposed defaults in `auth-accounts-sessions` (need owner approval, not yet confirmed): every self-registered account is a student; unverified accounts may sign in but a verified email is required before purchase; password 10 to 128 characters with no composition rules; access tokens 10 minutes, refresh tokens 30 days with a 90-day cap; account deletion erases personal data immediately and keeps only an anonymous id (retention policy pending legal review).

---

## Roles and audit: proposed defaults (change `rbac-core-and-audit`, 2026-11-17)

All of the following are **Proposed and need owner approval (Q06)**; nothing here is Confirmed.

| ID | Proposal |
|---|---|
| R01 | Every active account is a Student; at most one staff role (Instructor, Manager or Admin) per account. |
| R02 | Only Admins assign or revoke staff roles, always with a reason; nobody can change their own role; the last active Admin can never be removed. |
| R03 | Manager default permissions: users lookup, course create/update/publish, lesson upload, live scheduling, students and enrollments, operational reports, payment status only, review moderation, managing instructor permissions within a ceiling (set in a later change). Managers do not get role management, audit reading, or full payment data (resolves X05). |
| R04 | Instructors and Students hold no permissions by default; instructor capabilities come only from explicit grants (C06). |
| R05 | Staff roles require an active account with a verified email. |
| R06 | Audit reading is Admin-only for now. Audit rows are append-only and keep only ids, role and permission names, reasons and request ids. Retention and legal erasure are undecided (Q10). |
| R07 | First-Admin bootstrap (resolves Q14): an operator-run command with database access promotes an existing verified account when no Admin exists; a `--recovery` flag, always audited and marked, handles a locked-out sole Admin. |
| R08 | Instructor grants: seven grantable permissions (create course academy-wide; update, publish, lesson upload, live scheduling, students read, reports read per course). Admins may grant all; Managers all except publish course. Fixed in code for now; an Admin-editable ceiling is deferred. Proposed resolution of Q06. Approved by the owner in chat on 2026-11-18 together with the merge of PR 22. |
| R09 | An Instructor who creates a course automatically receives update, lessons, live, students and reports on it, never publish; revocable and audited. Approved by the owner in chat on 2026-11-18. |
| R10 | Grants end with the Instructor role (removal, replacement, account deletion) in the same transaction; grants of disabled accounts never take effect. A Manager may remove any grant, including an Admin's. Approved by the owner in chat on 2026-11-18. |
| R11 | Lessons are a flat ordered list per course for now (no modules or sections); up to 200 lessons per course. Modules come in a later change if the owner wants them. Approved by the owner in chat on 2026-11-18 (`course-lessons-basic`). |
| R12 | A lesson is "eligible for preview" only when staff turn on its free-preview flag. Anyone may read a free-preview lesson of a published course; every other lesson body is refused by the server until entitlements exist (`ENROLLMENT_REQUIRED`). Approved 2026-11-18. |
| R13 | Lessons are deleted for good (no soft delete) until progress tracking exists; `player-resources-progress` must revisit this. Approved 2026-11-18. |
| R14 | Publishing a course does not yet require a lesson; to be revisited in `course-lifecycle`. Lessons of a published course go live as soon as they are saved. Approved 2026-11-18. |
| R15 | Owners keep reading lessons of an unpublished course (lifetime access, C15); the course leaves the public catalog and My Courses marks it "Not currently on sale". Approved by the owner in chat on 2026-11-18 (`entitlements-core`); also answers the open question in `course-catalog-basics`. |
| R16 | Instructors do not see who is enrolled in this change; a separate Students view comes later under `students:read`. Approved 2026-11-18. |
| R17 | Only Admins and Managers (`enrollments:manage`) grant and revoke entitlements. Approved 2026-11-18. |

## UX reference review: pending owner decisions (2026-11-18)

See `docs/11_UX_REFERENCE_REVIEW.md`. All three are Proposed and need the owner.

| ID | Question | Proposed answer |
|---|---|---|
| Q20 | Is `branhamleonel-pixel/trading-academy` a reference for layout and interaction ideas only, inside ChartNexa's white, black and blue brand? | Yes. Its dark palette, effects and visual style are not adopted. |
| Q21 | Do any game mechanics (streaks, XP, quests, leagues, achievements) belong in the first release? | No. They conflict with the proposed Q08 exclusions; revisit after progress tracking (`player-resources-progress`). |
| Q22 | May code or assets from the reference be reused, and who owns and licenses them? | No reuse until the owner states the licence and ownership; the repository has no LICENSE file. |
| R18 | Q07 for text lessons: a lesson is complete when its owner marks it complete (and can undo it). The 90 percent watched rule is deferred until video exists. Approved by the owner in chat on 2026-11-18 (`lesson-progress-basic`). |
| R19 | Only owners (active entitlement) record progress; free-preview readers who do not own the course are not tracked. Approved 2026-11-18. |
| R20 | Staff do not see student progress yet; a scoped report comes later under `students:read`. Approved 2026-11-18. |
| R21 | Admins and Managers must pass a second step (TOTP authenticator code or a one-time recovery code) at every sign-in; Instructors and Students are not required to (Q15). Approved by the owner in chat on 2026-11-18 (`staff-mfa`). |
| R22 | The TOTP library is `otpauth` (MIT, one dependency, `@noble/hashes`), checked against the RFC 6238 test vectors on Node 26. Approved 2026-11-18. |
| R23 | Existing Admin and Manager sessions end at rollout, and assigning the Manager or Admin role ends the person's sessions, so the next sign-in goes through the second step. Approved 2026-11-18. |
| R24 | Lost device: another Admin resets the person (reason, audited, ends their sessions) or the operator runs `admin:bootstrap --reset-mfa`; nobody can remove or reset their own. Real-time phishing of a code is not prevented by TOTP; passkeys are a possible later change. Approved 2026-11-18. |
| R25 | Being enrolled (an active entitlement) is enough to review a course; no minimum progress yet (it is cheap to add later). Approved by the owner in chat on 2026-11-18 (`course-reviews-basic`). |
| R26 | A review shows the author's display name, or "Student" when none is set; never an email address or user id. Approved 2026-11-18. |
| R27 | A revoked owner's existing review stays visible; they can no longer write, edit or delete. Approved 2026-11-18. |
| R28 | Reviews are built and tested now but must not be released to real students before `reviews-moderation` exists, because staff cannot yet remove an abusive review. Approved 2026-11-18. |


## Review moderation: owner decisions Q23 to Q29 (approved 2026-11-18, see R29 to R33)

| ID | Question | Proposed answer |
|---|---|---|
| Q23 | Who may report a review? | Any signed-in person except the author, 20 reports a day. |
| Q24 | Reasons for reporting and hiding? | Spam or advertising; abusive or harassing; personal information; not about this course; other (note of 10+ characters). No rating-related reason. |
| Q25 | What does the author see about a hiding? | The reason and the note the moderator wrote. |
| Q26 | How do appeals work? | One per hiding; a different moderator decides; an Admin can decide any. |
| Q27 | Hide automatically after N reports? | Never. |
| Q28 | Can staff delete a review? | No, only hide (reversible). The author can still delete their own. |
| Q29 | May the author edit a hidden review? | Yes; it stays hidden and moderators see the current text. |

## Review moderation: built behaviour (change `reviews-moderation`, 2026-11-18)

Q23 to Q29 were approved in chat with the proposed answers ("yes, build it with your recommendations") and are now built:

| ID | Decision |
|---|---|
| R29 | Any signed-in person except the author may report a review (20 a day). Reasons: spam or advertising, abusive or harassing, personal information, not about this course, other (hiding "other" needs a note of 10+ characters). No reason refers to the rating. (Q23, Q24) |
| R30 | The author sees the reason and the moderator's note for a hidden review. (Q25) |
| R31 | One appeal per hiding, decided by a moderator other than the one who hid it; a person who can manage roles (Admin) may decide any appeal. Restoring a review settles an open appeal as overturned. (Q26) |
| R32 | Reviews are never hidden automatically, whatever the number of reports. Staff can only hide (reversible), never delete or edit; the author may still edit or delete their own, and editing a hidden review keeps it hidden. (Q27, Q28, Q29) |
| R33 | R28 is lifted once moderation has been run with staff: it is built and tested, but no real moderator has used it yet. |

## Observability: pending owner decisions (change `observability-baseline`, 2026-11-18)

| ID | Question | Proposed answer |
|---|---|---|
| Q30 | Add distributed tracing with an SDK (OpenTelemetry) and a hosted backend? | Not yet. Trace ids from `traceparent` are logged now; add the SDK when a second service or a queue exists. |
| Q31 | Which error-tracking service (for example Sentry) for the API and the app, and who owns the account? | Pending: needs an account, a data-processing review (no personal data may be sent) and cost approval. The API reports through `ErrorReporter`, so adding one is a single implementation. |
