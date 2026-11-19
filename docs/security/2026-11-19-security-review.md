# Security review, 2026-11-19

**Scope:** authentication and sessions, authorization (roles, grants, course scoping), payments (test provider), files and video, live classes, reviews, announcements, and every API route.
**Method:** code reading against the threats below, targeted tests, and a new automated route inventory. This was an internal code review, not a penetration test. Nothing was tested against a deployed system, because none exists.
**Reviewer:** the development agent. An independent review is still needed before release (Phase 9 `security-review`).

## Findings fixed in this review

| ID | Severity | Area | Finding | Fix and regression test |
|---|---|---|---|---|
| S1 | Medium | Payments | A signed `paid` event that left out `amountCents` granted access; only a wrong amount was refused. A real provider adapter that dropped the field would grant access for any amount. | A `paid` event must state the order's exact amount, or the outcome is `amount_mismatch` and nothing is granted. Test: `payments.integration.test.ts` "ignore a payment that does not state its amount". Existing tests now send the amount. |
| S2 | Low | All responses | No default security headers. Responses carrying tokens and personal data could be stored by proxies, and JSON was not marked `nosniff`. | `onSend` sets `cache-control: no-store`, `x-content-type-options: nosniff`, `content-security-policy: default-src 'none'; frame-ancestors 'none'`, `referrer-policy: no-referrer` and `x-frame-options: DENY`, unless a route set its own (file and video streams keep theirs). Test: `api.integration.test.ts` "security headers". |
| S3 | Process | Authorization | Routes opt in to authentication (no global default-deny). A new route without a guard would be public with no warning. | `route-guards.integration.test.ts` lists every route. It fails if an unguarded route is not on the reviewed public list, if a `/staff` route lacks AuthGuard plus PermissionGuard, or if a `/me` route lacks AuthGuard. |

## Checked and found sound

- **Access tokens:** HS256 only (`algorithms` pinned), at least 32-character secrets with no defaults, and the session is checked on every request (logout, disable and deletion take effect at once).
- **Refresh tokens:** stored hashed and rotated under a row lock. Reuse of an old token revokes the session. A password change revokes the other sessions.
- **Secret comparisons:** passwords (argon2), TOTP, file and video links, payment signatures and the metrics token all use constant-time comparison.
- **Course scoping:** staff routes under `/staff/courses/:courseId` look up lessons, modules, files, uploads, videos, entitlements and live classes by id and course together. An id from another course answers 404 (tests in each module).
- **Signed links:** each is bound to one object id and an expiry and HMAC-signed. They travel as query values, which logs drop (`safeUrl`). Files never get a link when not downloadable, infected files are never stored, and the database allows only `clean` or `not_scanned`.
- **Storage keys:** validated against a safe pattern, `..` refused, and resolved inside the storage root.
- **Uploads:** content type sniffed and matched against the declared type, sizes and part counts bounded (application and database checks), and the parser body limit is one part.
- **Payments:**
  - The provider name and signature are checked before anything else, and events are de-duplicated by provider and event id.
  - Orders are locked during transitions, and only the state machine changes status.
  - Access comes only through entitlements.
  - The test provider and test checkout are refused in production (config check).
- **Live classes:** the meeting link is https only, has no credentials, is never in lists or audit logs, and is given only while the class is open to people with active access.
- **Announcements:**
  - Plain text, rendered as text.
  - Visibility is enforced in one server function.
  - Marking an announcement you cannot see answers 404.
  - Only `announcements:publish` holders post.
- **Logging:** authorization headers, cookies, passwords, tokens, recovery and MFA codes, and emails are redacted, and query values are dropped from URLs.
- **Production configuration:** development adapters (local storage, no scanning, test video, test payments, dev mail) are refused at start-up.
- **Mobile:** session tokens are kept in `expo-secure-store` (`apps/mobile/src/auth/token-store.ts`), never in plain storage.
- **Dependencies:** `pnpm audit --audit-level high` passes. Two moderate advisories (glob, minimatch) are in Expo build tooling, not shipped to the server.

## Accepted risks and requirements for later work

- **O1, real payment adapters:** they must verify the provider's signature over the raw request body. The test adapter re-serialises the parsed event, which is acceptable only because it signs its own events. This is a requirement for `stripe-web-checkout` and store billing.
- **O2, links outlive revocation:** signed links stay valid until they expire after access is revoked (files `FILE_LINK_TTL_SECONDS`, default 5 minutes; video `VIDEO_LINK_TTL_SECONDS`, default 4 hours). A real video provider with short-lived per-segment tokens shortens this (Q09).
- **O3, shared secret:** file and video links derive their key from `ACCESS_TOKEN_SECRET` with a fixed label. Rotating the access-token secret invalidates open links, which is acceptable.
- **O4, no rate limits on cheap signed-in actions:** joining a live class, marking an announcement read and continue-learning have no rate limits. They are signed in, idempotent and cheap. Revisit with load-test results.
- **O5, staff uploads are not rate limited per person:** open sessions expire and are swept. Disk use depends on the storage provider (Q32).
- **O6, no CORS:** the API sends no CORS headers, so browsers cannot call it from other sites. A future web workspace needs an explicit origin allowlist.

## Not done (needs people, accounts or a deployment)

Penetration test, TLS and hosting configuration, secret storage in the hosting platform, mobile binary review (jailbreak/root, certificate pinning decision), store privacy forms, and a dependency licence review.
