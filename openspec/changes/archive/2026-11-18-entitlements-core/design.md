# Design

## Context

Existing: `modules/access` (permissions incl. `enrollments:manage` for Admin and Manager, audit service), `modules/courses`, `modules/lessons` (public reads refuse locked bodies with `ENROLLMENT_REQUIRED` in one place), user lookup by email for staff, a placeholder My Courses tab, optional-auth is not yet used on any public route. ADR-0006 (Accepted) fixes the model: source and status columns, a partial unique index for one active entitlement per user and course, database-read access checks.

## Decisions (proposed)

1. **Module `modules/entitlements`** with a service, a staff controller and a "me" controller; exports `EntitlementsService.hasActive(userId, courseId)` for other modules, which is the only way lessons ask about access.
2. **Data:** `entitlements(id uuid, user_id FK, course_id FK, source text CHECK in ('admin_grant'), status text CHECK in ('active','revoked'), grant_reason, granted_by, created_at, revoked_at, revoked_by, revoke_reason)`. Partial unique index `(user_id, course_id) WHERE status = 'active'`. CHECKs: reason length 3 to 200, `revoked_at` set exactly when status is `revoked`. Indexes for My Courses `(user_id, created_at desc, id desc) WHERE status='active'` and for the staff list `(course_id, created_at desc, id desc) WHERE status='active'`. The `source` CHECK widens to `stripe`, `apple`, `google` in the payments change; `suspended` is not added now (YAGNI, ADR lists it for later).
3. **Idempotent grant:** `INSERT ... ON CONFLICT (user_id, course_id) WHERE status = 'active' DO NOTHING RETURNING`; no row returned means it already existed, and no audit row is written. Revoke is `UPDATE ... WHERE id AND status = 'active'` plus audit in the same transaction; zero rows is a no-op. A grant racing a revoke serializes on the row or the index, so the end state is consistent.
4. **Eligibility:** target must exist, be active (not disabled or deleted) and have a verified email (consistent with R05 style rules for staff roles; a student without a verified email could not receive purchases either). Staff look up the student with the existing lookup endpoint, so there is no new way to probe accounts; grant by `userId`.
5. **Optional authentication on public lesson routes:** a small `OptionalAuthGuard` that sets the user when a valid token is present and otherwise continues as signed out, including for invalid and expired tokens. It must never throw and must not extend any other behavior; tests cover valid, missing, malformed and expired tokens. Lesson reads call `hasActive` only when the lesson is locked and the caller is signed in (one indexed query).
6. **Unpublished courses and owners (open decision 1):** the lesson routes check `published OR hasActive`; the outline and previews for non-owners still 404. My Courses lists regardless of publish state and returns `onSale: boolean`.
7. **Endpoints:** staff `POST /staff/courses/:courseId/entitlements {userId, reason}` (always 200 with `created` true or false), `POST /staff/courses/:courseId/entitlements/:id/revoke {reason}`, `GET /staff/courses/:courseId/entitlements` (paged); me `GET /me/courses` (paged) and the public course detail gains `enrolled` (false when signed out), via the same optional auth.
8. **Audit:** `entitlement.grant` and `entitlement.revoke` with ids, source and reason; no email, no display name. Denied attempts on staff routes are audited using the existing `auditDenied` option.
9. **App:** My Courses tab uses an infinite query with `useRestorableScroll`; the course page reads `enrolled` from the detail and invalidates `["course", id]`, `["lessons", id]` and `["my-courses"]` after access changes; the lesson reader shows a distinct "no longer have access" state on `ENROLLMENT_REQUIRED`. Staff Students screen: list with Revoke, "Grant access" as a full-screen form (email lookup, then reason, then confirm) reusing the instructor-search pattern; revoke uses the existing confirm dialog with a reason field.

## Threat model (short)

- Access escalation by a Student or Instructor: permission checked server-side on every staff route; tests for each role.
- Stale access: no cache, no token claims; tests with tokens issued before grant and before revoke.
- Account probing through grant: only the lookup endpoint (already permission-gated) reveals existence; grant errors are limited to what staff already saw.
- Optional-auth bypass: invalid tokens never produce an authenticated user; it only ever adds access, never removes the existing refusal.
- Double grant and races: partial unique index is the last line of defense.
- Personal data in logs and audit: ids only; tested.

## Observability

Counters for grant and revoke outcomes (ok, existing, ineligible, forbidden) once the metrics facility exists (`observability-baseline`); until then request logs carry ids only.

## Migration and rollback

Additive table and indexes with `down.sql`, covered by the round trip. No existing data changes. Rollback drops the table; lessons fall back to previews only.

## Risks / Trade-offs

- Hand grants are an operational stand-in for purchases; the same table and checks are reused by payments, so this is not throwaway work.
- Letting owners read unpublished courses exposes content staff meant to pull; the alternative breaks lifetime access, so it is an owner decision.
- The extra indexed read on locked lessons adds a little latency; measure before any capacity claim.

## Open Questions (owner)

None. The three decisions in the proposal were approved and are recorded as R15 to R17.
