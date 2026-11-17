# Business rules, edge cases and error handling

## Purchase and entitlements
- User may purchase a course **once** per commercial entitlement under the confirmed model; exact handling for repeat gifting/rebuying is pending.
- Confirm payment in **trusted backend** via provider verification/webhook, not by the mobile success screen.
- Exactly-once business outcome via idempotency keys, DB uniqueness constraints and payment state machine (provider events can be duplicated, delayed, reordered).
- Restore incomplete checkout status when user returns/reopens. Show pending state; no premature access.
- Lifetime access on verified purchase; pending decisions: refunds/reversals, chargebacks, course deletion, copyright takedowns, banned accounts, course replacement and account deletion.
- Separate **purchase**, **payment**, **enrollment/entitlement**, and **course progress** records; avoid treating payment status as sole authorization source.
- Comply with mobile app store payment policy. Stripe may be used for eligible web transactions; payment strategy inside iOS/Android must be approved before build.

## Course lifecycle
- Draft, review, published, hidden, archived (proposed states). Define who can change state; logs for publication.
- Already-enrolled students and unpublished/removed courses: access policy pending.
- Instructors only edit assigned courses within explicit permission scope. Unassign during active upload: immediately re-check authorization before final write.

## Lesson/media handling
- Validate allowlisted extensions AND MIME/content; malware scanning where appropriate; enforce size, quota and max processing limits.
- Use short-lived authenticated/signed URLs; never public permanent links for paid resources by default.
- Large uploads: resumable progress/retry, deduplication, cleanup of abandoned uploads; asynchronous transcoding with status.
- Playback: slow network, buffering, offline, expired token, unavailable resource, unsupported format and content changes handled gracefully.
- Exact student download permissions per resource are pending. Word/PDF rendering choices must be secure and portable.

## Reviews and feedback
- Only eligible enrolled student can rate/review course (confirmed). Proposed 1–5 stars and one active review per student-course.
- No allowing repeated votes to inflate average. Recalculate rating aggregates correctly (transactional/outbox approach as needed).
- Edit/delete/report/moderate with auditable reasons (proposed). No suppression solely for negative rating.
- Handle account/course deletion, duplicate submit, rapid edits, race conditions and invalid/abusive content.

## Auth and role boundaries
- Expired session, token rotation, password reset abuse, device clock drift, account disabled and privilege revocation must be tested.
- Admin vs Manager delegation ceiling: Manager cannot grant permissions they do not possess or elevate themselves.
- Ensure tenant/academy boundary if multiple academies are ever added (multi-tenancy is not confirmed).

## UX/error policy
- Show human-actionable errors and optional Retry, not raw server traces.
- Prevent accidental duplicate submits. Keep unsaved drafts safe on connection loss where possible.
- Preserve navigation context after modal/review sheet/checkout/login.
- Graceful empty states for first-time students and instructors with no assigned course.
- Accessibility: errors tied to fields, focus management after sheet close, labels on icons, readable contrast.
