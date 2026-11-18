# Design

## Context

`modules/courses` (public detail and catalog summaries, `lockForUpdate`), `modules/entitlements` (`hasActive`), optional sign-in on public routes (`OptionalAuthentication`, `MaybeUser`), the signed-cursor pagination helper, account-deletion hooks, the shared query-count test pattern, and the course page with its sections. Roadmap scenario S6 (concurrent submits give one review and a consistent aggregate).

## Decisions (proposed)

1. **Module `modules/reviews`**, importing entitlements and courses through their indexes.
2. **Data:** `reviews(id uuid, user_id FK, course_id FK, rating smallint CHECK 1..5, body text CHECK length <= 1000, created_at, updated_at)` with `UNIQUE (user_id, course_id)` and an index `(course_id, created_at desc, id desc)` for paging. Totals on `courses`: `rating_count integer NOT NULL DEFAULT 0 CHECK >= 0`, `rating_sum integer NOT NULL DEFAULT 0 CHECK >= 0` (and `rating_sum BETWEEN rating_count AND 5 * rating_count`, which the database can check because every review is 1 to 5).
3. **Upsert with exact totals:** one transaction that locks the course row (`FOR UPDATE`, the same helper lessons use), reads the person's existing review, writes the review (insert or update) and then updates `rating_count` and `rating_sum` by the difference (new minus old). Locking the course serializes all review writes for that course, which is fine at this scale and makes the arithmetic exact under any interleaving. The unique constraint is the last line of defense. Idempotent by nature: submitting the same content twice leaves one review and unchanged totals.
4. **Delete:** same transaction and lock; remove the row if present and subtract; repeating it is a no-op that still answers 200.
5. **Endpoints:** public `GET /courses/:courseId/reviews?limit&cursor` (published courses, or owners of an unpublished one, using optional sign-in); signed-in `GET /me/courses/:courseId/review` (own review or `null`), `PUT /me/courses/:courseId/review {rating, body}` (create or replace), `DELETE /me/courses/:courseId/review`. The person comes only from the token. Owner check first (`ENROLLMENT_REQUIRED` 403), as with progress.
6. **Display name:** the reviewer's `display_name` or "Student", computed in the query; no id or email in the response. Reviews of deleted accounts do not exist (deleted with the account).
7. **Summary in responses:** `rating: { count, average }` where `average` is `round(sum / count, 1)` or `null` when count is 0. Added to `PublicCourseSummary` (catalog cards) and `PublicCourseDetail`, read from the columns already loaded, so there are no extra queries.
8. **Account deletion:** a deletion hook that, per course the person reviewed, subtracts their rating from the totals and deletes the rows, with course rows locked in id order to avoid deadlocks.
9. **Rate limit:** review writes limited per person (reuse the generic limiter) to stop scripted floods; failures log ids only.
10. **App:** `ReviewsSection` on the course page (infinite query keyed `["reviews", courseId]`), a `RatingSummary` component used by cards and the page, a `ReviewSheet` (stars, text, character count; a client-generated nothing, since the PUT is naturally idempotent), delete via the existing confirm dialog. After a write, invalidate `["reviews", id]`, `["my-review", id]`, `["course", id]` and the catalog.
11. **Text safety:** plain text rendered in `Text`; control characters other than newline rejected, as with lessons.

## Threat model (short)

- Fake reviews by non-owners: entitlement checked on every write; tested with a token that predates a revoke.
- Editing others' reviews: the author is always the token's user; no review id in the write routes.
- Rating inflation by repeated submits: one row per person and course; totals derive from row differences under a lock.
- Aggregate drift: CHECKs bound the totals, tests recompute from rows after random sequences of operations.
- Personal data: only the display name is shown; no email or id; deletion with the account.
- Abuse content: **no moderation yet**; the change must not be released to real students before `reviews-moderation`.

## Observability

Request logs carry ids and outcomes only; counters for review writes once the metrics facility exists.

## Migration and rollback

Additive table and two columns with defaults, plus a backfill that is trivially zero because no reviews exist. `down.sql` drops the table and columns.

## Risks / Trade-offs

- Locking the course row serializes review writes per course; acceptable for reviews (rare writes), and no capacity claim is made.
- Stored totals can drift if someone edits rows by hand; the CHECKs bound them and a test recomputes them, and a repair query is documented.
- Hard delete loses history; moderation will need its own record of hidden reviews.

## Open Questions (owner)

None. The four decisions in the proposal were approved and are recorded as R25 to R28.
