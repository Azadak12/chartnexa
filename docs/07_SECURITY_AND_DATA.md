# Security, privacy and conceptual data model

## Security baseline
- Server-side RBAC + per-resource/ownership checks on every API request and media access.
- Strong authentication, safe password hashing if first-party auth, encrypted connections, secret manager, secure mobile token storage.
- Least privilege, administrative action audit logging, rate limits, input validation, file-upload content scanning/allowlisting, SSRF-safe remote imports if any.
- Payment: verify signatures; never store raw card data; keep tokens/keys on server; replay and idempotency controls.
- Privacy/data protection: collect only necessary personal data; define retention, account deletion, export and legal obligations by operating regions.
- Backups, tested restore, migration rollback plan, incident alerts, rotation of credentials and environment separation.

## Conceptual entities (NOT final schema)
- `users`, `profiles`, `roles`, `permissions`, `user_role_assignments`, `instructor_course_assignments`, `permission_grants`, `audit_events`.
- `courses`, `course_categories`, `modules`, `lessons`, `assets`, `lesson_assets`, `course_publication_events`.
- `live_sessions`, `live_attendance` (provider/behavior pending).
- `orders`, `payment_attempts`, `payment_events`, `entitlements`/`enrollments`, `refunds` (policy pending).
- `lesson_progress`, `course_progress` (derived/aggregated), `review`, `review_reports`, `review_moderation`.
- `notification_events`, `notification_deliveries` (channels TBD).

## Uniqueness / integrity candidates
- Unique payment-provider event ID per provider and idempotency ID per business operation.
- Unique active entitlement per student-course-purchase model as appropriate.
- Unique active review per student-course; constrained rating range.
- Foreign keys for course/modules/lessons and no orphaned attached assets.
- Track created/updated state; respect soft deletion/takedown requirements after policy approval.

## Production architecture evidence
- Threat model, secure code review, dependency scanning, penetration testing plan, audit retention, privacy impact review and demonstrably working backups/restore.
- Confirm hosting region and compliance with actual jurisdiction; no unsupported compliance claims.
