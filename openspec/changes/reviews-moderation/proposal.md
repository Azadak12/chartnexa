# Proposal

## Why

Reviews exist (`course-reviews`) but nobody can remove an abusive one, so decision R28 forbids releasing them to real students. The product docs confirm that staff moderate reported reviews with a reason and an audit trail, that a Manager cannot rewrite a student's review (`docs/02`), and that no review may be suppressed solely for a negative rating (`docs/06`). Review moderation and appeals are listed as pending policy (`docs/02`), so the rules below are **proposals** for the owner to confirm.

## What Changes

- **Reporting:** a signed-in person (not the review's author) can report a review with a reason from a fixed list and an optional short note. One report per person and review; reporting is rate-limited. The author never learns who reported.
- **Hiding:** an Admin or Manager holding `reviews:moderate` can hide a review, with a required reason from a fixed list and a note. Hiding is reversible and never edits or deletes the review. A hidden review leaves the public list and the rating totals; restoring puts it back. There is no automatic hiding, whatever the number of reports.
- **Author view:** the author still sees their own hidden review, marked as hidden with the reason and note. They can still edit or delete it (an edit does not make it visible again).
- **Appeals:** the author of a hidden review can appeal once per hiding with a short message. A moderator **other than the one who hid it** decides: uphold (stays hidden) or overturn (restored). An Admin can decide any appeal.
- **Staff queue:** a Reviews screen (roadmap M09) with Reported, Hidden and Appeals tabs, a review detail screen with its reports and history, and sheets for hide, restore and decide.
- **Safeguards:** the reason list has no "low rating" option; no endpoint changes a review's rating or text for staff; every action is audited with ids and reason codes only; instructors have no moderation access.
- Lifts the release block in R28 once verified.
- **Not included:** notifications or email to authors, reviewer sanctions or bans, automated or word-list detection, bulk actions, instructor replies, sorting by rating or helpfulness, public moderation statistics, permanent staff deletion.

## Confirmation status

- Confirmed: staff moderate reported reviews with a reason and an audit trail; staff cannot rewrite a review; no suppression solely for a negative rating.
- Proposed here, needs owner approval: everything under "Decisions for the owner".

## Decisions for the owner

1. **Who may report?** Proposed: any signed-in person except the author, limited to 20 reports a day. (Alternative: only enrolled students.)
2. **Reasons for hiding and reporting.** Proposed: spam or advertising; abusive or harassing; personal information; not about this course; other (a note of at least 10 characters is then required). No "low rating" or "disagree" option.
3. **What the author sees.** Proposed: the reason and the note the moderator wrote (moderators are told the author will read it).
4. **Appeals.** Proposed: one appeal per hiding; a different moderator decides; an Admin can decide any; a restored review that is hidden again may be appealed again.
5. **Automatic hiding after N reports.** Proposed: never, because a group could suppress an honest review.
6. **Removal.** Proposed: staff can only hide, not delete; the author can still delete their own review.
7. **Can a hidden review be edited by its author?** Proposed: yes; it stays hidden and the moderator sees the current text.

## Capabilities

### New Capabilities
- `review-moderation`: reports, hiding and restoring, appeals, the staff queue and the audit trail.
- `mobile-review-moderation`: report, appeal and the staff Reviews screens in the app.

### Modified Capabilities
- `course-reviews`: totals, the public list and the owner's own view account for hidden reviews; account deletion removes reports and appeals.

## Impact

- New: moderation columns on `reviews`, `review_reports` and `review_appeals` tables (migration with `down.sql`), a moderation part of the reviews module, staff endpoints under the existing permission model, shared schemas, app screens, contract tests.
- Changes: rating totals now count visible reviews only; the owner's own review response gains a moderation state.
- No new dependencies. No secrets.
