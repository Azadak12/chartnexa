# Design

## Context

`modules/reviews` (writes under a course row lock, stored `rating_count` and `rating_sum`), `@RequirePermission("reviews:moderate")` (Admin and Manager by default; staff MFA already applies), `AuditService.record(tx, ...)` (ids and codes only), `RateLimiterService`, account-deletion hooks, the staff-screen pattern from lessons and instructor permissions.

## Decisions (proposed)

1. **Data.** On `reviews`: `hidden_at`, `hidden_by` (FK users, nullable), `hidden_reason` (enum text), `hidden_note` (text, at most 500), with a CHECK that all four are set together or all null. New `review_reports(id, review_id FK cascade, reporter_id FK, reason, note <= 300, created_at, UNIQUE(review_id, reporter_id))`. New `review_appeals(id, review_id FK cascade, hidden_at copy, message <= 500, status open|upheld|overturned, decided_by, decided_note, created_at, decided_at)` with a partial unique index allowing one appeal per review and hiding (`UNIQUE(review_id, hidden_at)`).
2. **Totals are visible reviews only.** Hide subtracts the rating, restore adds it, in one transaction under the same course lock (then the review row `FOR UPDATE`). Every review write path (write, edit, delete, account deletion) adjusts totals only when the row is visible. The CHECKs on totals stay valid. A randomized test recomputes totals from visible rows.
3. **Hide and restore are idempotent.** Hiding a hidden review or restoring a visible one answers 200 with no change and no second audit row. A concurrent author edit, delete or moderator action serializes on the lock, so the final state is one of the legal orders.
4. **Edits never touch moderation state.** There is no staff route that changes `rating` or `body`; the author's PUT keeps `hidden_*` as is and does not change totals while hidden.
5. **Reports.** `POST /courses/:courseId/reviews/:reviewId/report` (signed in, not the author, review visible to the public and the course published). A repeat by the same person answers 200 and changes nothing. Reporting does not alter visibility. Rate limited per person.
6. **Staff API** (all `reviews:moderate`, server-side): `GET /staff/reviews?tab=reported|hidden|appeals&courseId&cursor` (paged, with report counts), `GET /staff/reviews/:id` (review, reports with reasons and times, hiding history), `POST /staff/reviews/:id/hide {reason, note}`, `POST /staff/reviews/:id/restore {note}`, `POST /staff/review-appeals/:id/decide {decision, note}`. The decider must differ from `hidden_by` unless the caller has `roles:manage` (Admin). Reporter identity is shown to staff only.
7. **Author API.** `GET /me/courses/:courseId/review` gains `moderation: null | { state: "hidden", reason, note, canAppeal, appeal: null | {status, decidedNote} }`; `POST /me/courses/:courseId/review/appeal {message}` (owner only, review hidden, no appeal yet for this hiding).
8. **Negative-rating safeguard.** The reason list contains no rating-related reason, the server rejects anything outside it, `other` requires a note of 10 or more characters, and the audit entry records rating bucket (1 to 5) next to the reason so the owner can review patterns later. This cannot prove intent; it makes suppression visible and reversible.
9. **Audit.** Actions `review.report`, `review.hide`, `review.restore`, `review.appeal`, `review.appeal.decide`, recording ids, reason code and decision, never the text or notes.
10. **Account deletion.** Reports made by the person are deleted; their reviews cascade to reports and appeals; totals change only for visible reviews. Moderators who are deleted keep `hidden_by` as null (FK ON DELETE SET NULL, with the CHECK allowing a null hider after the fact).
11. **App.** Review row gets an overflow "Report" (sheet with reasons and note, announcements, focus return). The author's own review shows a text banner (not color alone) with reason, note and an Appeal sheet. Staff get full screens: queue with three tabs and a detail screen; hide, restore and decide are sheets. Staff controls render only when `/me` shows the permission, and the server enforces it regardless.

## Threat model (short)

- Brigading: reports never hide anything by themselves; one report per person; daily limit.
- Moderator abuse or bias: required reason from a fixed list, reversible, audited, appeal decided by someone else, no rewriting.
- Manager rewriting a review: no such route; tested by attempting the author's PUT as a moderator (it edits only their own review, and 403 without entitlement).
- Information leakage: reporters hidden from authors and the public; notes and reasons shown only to the author and staff; hidden reviews absent from public lists, by id too (404 on report of a hidden review).
- Totals drift: all paths adjust under the lock; randomized recompute test.
- Privilege: the permission is checked on every staff route, and a role downgrade takes effect on the next request.

## Migration and rollback

Additive columns and tables; existing reviews are visible. `down.sql` drops the tables and columns, and if any review is hidden it first restores totals (documented, tested in the round trip with hidden rows).

## Risks / Trade-offs

- The "different moderator" rule can stall appeals when only one moderator exists; the Admin override handles that.
- Locking the course row serializes moderation with reviews; acceptable for rare writes, with no capacity claim.
- Fixed reason lists may need extension; they are an enum in code and contracts, so changing them is a reviewed change.

## Open Questions (owner)

The seven decisions in the proposal.
