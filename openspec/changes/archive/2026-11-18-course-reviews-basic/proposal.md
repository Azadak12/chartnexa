# Proposal

## Why

Course pages say nothing about what students thought. The product brief confirms that an enrolled student can rate and review a course, and proposes an average score and a reviews list (`docs/02`). Reviews are also the roadmap's concurrency test case (S6): two simultaneous submits must leave one review and a correct average. Entitlements now exist, so "who may review" can be answered from the database.

## What Changes

- Add **reviews** on the server: one review per person and course, a rating from 1 to 5 and optional plain text (up to 1,000 characters). Only a person with an active entitlement to the course may write, edit or delete their own review.
- Add the **rating summary**: average (one decimal) and count, kept as stored totals on the course and updated in the same transaction as every review change, so the number is always consistent with the list.
- Add **public reading**: anyone can page through a published course's reviews, newest first, and see the summary on the course page and on catalog cards. A review shows the rating, the text, the date and the reviewer's display name (or "Student" when none is set); never an email address.
- App, students: the course page gets a rating summary and a Reviews section (list with paging). An owner sees **Write a review** (or **Edit your review** and **Delete**) in a sheet with five tappable stars and a text box.
- Reviews follow the rules of access: a person whose access is revoked cannot write, edit or delete; their existing review stays visible. Unpublishing a course hides its reviews from the public like its lessons, but owners still see them.
- Deleting an account deletes the person's reviews and corrects the totals in the same transaction.
- Verify against the real server with contract tests, including concurrent submits.
- **Not included (next change, `reviews-moderation`):** reporting a review, hiding or removing a review as staff, appeals, sorting by rating or helpfulness, instructor replies, review photos or links, "verified purchase" labels, sending a prompt to review, and requiring progress before reviewing. **Until moderation exists there is no way for staff to remove an abusive review**, which is why this change should not be released to real students without it (see the decisions below).

## Confirmation status

- Confirmed: only an eligible enrolled student can rate or review a course (docs/06, docs/02).
- Proposed (docs) and proposed here, needs owner approval: 1 to 5 stars; one active review per student and course; editable and deletable by its author; display name shown with a "Student" fallback; plain text only; 1,000-character limit; newest first; being enrolled is enough (no minimum progress); reviews of a revoked owner stay visible; hard delete.
- Pending and not decided: the moderation rules (who may hide, the appeal flow, what "report" means) and any use of ratings for ranking or search.

## Decisions for the owner

1. Is being enrolled enough to review, or should the person have completed at least one lesson first? (Proposed: enrolled is enough; progress now exists, so a minimum is cheap to add later.)
2. Show the reviewer's display name, or only "Student"? (Proposed: display name when set, with a "Student" fallback, never an email.)
3. Keep a revoked owner's review visible? (Proposed: yes; it was written while they had access.)
4. Release reviews to real students before `reviews-moderation` exists? (Proposed: no; build and test now, release together with moderation.)

## Capabilities

### New Capabilities
- `course-reviews`: writing, editing, deleting and reading reviews, and the rating summary.
- `mobile-course-reviews`: the rating summary, the list and the review sheet in the app.

### Modified Capabilities
<!-- None: summaries on the catalog and course detail are described in the new specs. -->

## Impact

- New: `reviews` table and rating totals on `courses` (migration with `down.sql`), a reviews module in the API, shared schemas, app components, contract tests.
- Changes: public course summaries and details gain `rating`; account deletion also removes the person's reviews.
- No new dependencies. No secrets.
