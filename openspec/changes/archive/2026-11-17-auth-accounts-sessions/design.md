# Design

## Context

Existing: NestJS/Fastify API with the error envelope (`api-platform`), PostgreSQL via Prisma with tested `down.sql` migrations (`database-migrations`), CI with a Postgres service, request IDs, log redaction (authorization, cookie, token, password, email), signed-cursor pagination, strict Zod validation. No users table. ADR-0004 (first-party proposal), ADR-0005 (authorization is data, not token claims; `authz_version`), ADR-0006 (idempotency) are accepted or relevant. Owner decisions recorded in proposal.md. Observed: Node 26 provides `crypto.argon2`; `jose` 6.x is MIT.

## Goals / Non-Goals

**Goals:** safe, tested first-party authentication that later changes consume through one guard and one `currentUser` abstraction; immediate revocation; no account enumeration; deletable accounts.
**Non-Goals:** roles/permissions, MFA, social login, real email delivery, mobile UI, audit tables, device attestation.

## Decisions

1. **Module layout:** one `modules/identity` module (accounts, auth, sessions, tokens, password) plus `modules/mailer` and `modules/rate-limit`. (Implementation deviation: accounts and auth need each other for deletion and password change, so splitting them created a circular dependency.) Others import only through each module's `index.ts` (lint-enforced). Shared request/response Zod schemas live in `packages/api-contracts` so mobile reuses them.
2. **Password hashing:** Argon2id via Node's built-in `crypto.argon2` (no native add-on). Parameters from OWASP guidance (memory 19 MiB or more, iterations 2, parallelism 1) tuned so a hash takes roughly 50-150 ms on the target host; stored in PHC-style string with parameters so they can be raised later and hashes upgraded on login. Alternative: the `argon2` npm package (native build) or `@node-rs/argon2`; rejected to avoid a dependency when the platform provides it. Verify the API and parameters on the pinned Node at apply.
3. **Access tokens:** JWT (HS256 via `jose`) with `sub`, `sid`, `iat`, `exp`, `jti`; 10-minute lifetime; no email, role or permission claims (ADR-0005). The signing secret comes from config and supports a second "previous" secret for rotation. Alternative: opaque tokens only (needs a DB read for every request anyway); JWT chosen so signature and expiry fail fast and later services can verify cheaply.
4. **Per-request revocation check:** the guard verifies the JWT, then reads one indexed row (session + user status + `authz_version`) by primary key. This gives immediate logout, disable and deletion at the cost of one cheap query per authenticated request. Alternative: pure stateless JWT with a 10-minute revocation lag, rejected because the product spec requires immediate effect. A short in-process cache can be added later only if measurement justifies it and with an explicit staleness bound.
5. **Refresh tokens:** 256-bit random, base64url, returned once, stored as SHA-256 hash (high-entropy input, so a fast hash is appropriate). Each session row holds the current token hash and the hash of the previous one with its rotation time. Rotation runs in one transaction with `SELECT ... FOR UPDATE` on the session row. If a presented token matches the previous (rotated-out) hash, or a revoked session, the session is revoked (reuse detection) and the event logged. No grace window in this change: strictness is safer, and the cost (a client that loses the refresh response must log in again) is recorded as a risk. Sliding 30-day expiry per rotation, hard 90-day cap from session creation.
6. **Sessions table:** `sessions(id, user_id, refresh_hash, previous_refresh_hash, rotated_at, device_label, created_at, last_used_at, expires_at, absolute_expires_at, revoked_at, revoked_reason)`. Device label comes from a sanitized, length-limited client header or user agent. Never stores IP in clear text beyond what logs already hold; store only a coarse label.
7. **Users table:** `users(id uuid, email, email_normalized unique where deleted_at is null, password_hash, display_name, status, email_verified_at, authz_version, created_at, updated_at, deleted_at)`. Uniqueness is a plain unique index on the normalized email, which is nulled on deletion (PostgreSQL allows many NULLs), so a deleted account's email can be registered again without a partial index. Deletion sets `deleted_at`, nulls email, hash and display name, bumps `authz_version`, revokes sessions; the row stays so later purchase records keep a foreign key. Retention and legal erasure policy remain open (Q10, N02/legal).
8. **One-time tokens:** verification and reset tokens are random 256-bit values stored hashed with expiry (24 h and 30 min) and `used_at`; redeeming uses a single `UPDATE ... WHERE used_at IS NULL AND expires_at > now() RETURNING` so concurrent redemption yields one winner. Resetting a password also invalidates other unused reset tokens and revokes all sessions.
9. **Anti-enumeration:** register, forgot and login return uniform responses. Register for an existing email returns the normal success body and sends the owner a "someone tried to register" email instead. Login for an unknown email runs a dummy Argon2 verification against a precomputed hash to equalize timing. Verification and reset failures share one generic error.
10. **Rate limiting:** Postgres-backed fixed-window counters `rate_limits(key, window_start, count)` updated with an atomic upsert; keys combine endpoint with client address and, where present, a hash of the normalized email. Limits are config (defaults: login 5 failures per 15 min per email and 20 per 15 min per address; forgot 3 per hour per email; register 10 per hour per address). A 429 includes a retry-after value. Client address comes from the trusted proxy setting (configured, default: socket address); misconfiguration risk is documented. Alternative: Redis (deferred per ADR-0002 until measured need) or in-memory (breaks with several instances).
11. **Mailer:** `Mailer` interface with `send({to, template, data})`; drivers: `memory` (tests capture messages), `dev` (writes each message to a git-ignored `.dev-mail/` directory so tokens never enter structured logs). The `dev` and `memory` drivers are rejected at startup in production until a real provider exists. Email templates are plain text with a deep-link base from config; link format is finalized in the mobile change.
12. **Endpoints (under `/auth` and `/me`):** `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/email/verify`, `/auth/email/resend`, `/auth/password/forgot`, `/auth/password/reset`; `GET/PATCH /me`, `DELETE /me`, `POST /me/password`, `GET /me/sessions`, `DELETE /me/sessions/:id`. All inputs via `z.strictObject`; all errors in the envelope with codes `UNAUTHENTICATED`, `RATE_LIMITED`, `VALIDATION_FAILED`.
13. **Guard API for later changes:** a `@Authenticated()` decorator plus a `currentUser` parameter decorator yielding `{ userId, sessionId }`. Authorization (roles/permissions) is added by `rbac-core-and-audit` on top; this change does not decide who may do what beyond "own account only".
14. **Security logging:** structured events `auth.login.success|failure`, `auth.refresh.reuse_detected`, `auth.session.revoked`, `auth.password.reset`, `auth.account.deleted` with request id, user id and session id only. Persistent audit tables come with `rbac-core-and-audit`.
15. **Config additions (validated at startup, values never printed):** `ACCESS_TOKEN_SECRET` (min 32 chars), optional `ACCESS_TOKEN_SECRET_PREVIOUS`, token TTLs, rate-limit settings, `MAILER_DRIVER`, `APP_LINK_BASE`, `TRUST_PROXY`.
16. **Docs:** ADR-0004 set to Accepted (first-party), decision register updated; API README gains an auth section; `.env.example` placeholders added.

## Risks / Trade-offs

- Strict refresh reuse detection logs out clients that lose a refresh response -> client stores tokens atomically; revisit with a short grace window only if telemetry shows it is common.
- One DB read per authenticated request -> primary-key lookup, measured in the capacity tests; cache only with an explicit staleness bound.
- Argon2 parameters too heavy or light for the real host -> parameters are configuration with a documented tuning step and hash-upgrade on login.
- Postgres rate limiting adds write load on abusive traffic -> counters are small upserts; move to Redis when measured, and put a CDN/WAF in front at deployment.
- Dev mail outbox is a plaintext token store -> directory is git-ignored, development only, and blocked in production by startup validation.
- Wrong trusted-proxy setting makes every user share one limit or lets attackers spoof addresses -> `TRUST_PROXY` defaults to off; deployment doc must set it deliberately.
- Account deletion retention vs legal erasure is undecided -> design deletes personal data now and keeps only the anonymous id; legal review before launch.
- Anti-enumeration via "someone tried to register" email can be used to spam an owner -> counted against the per-email rate limit.

## Migration Plan

Additive migrations: `users`, `sessions`, `email_tokens`, `password_reset_tokens` (or one `one_time_tokens` table with a type column), `rate_limits`; each with a reviewed `down.sql` and covered by the existing round-trip test. Rollback drops these tables; no data in other tables references them yet.

## Open Questions

- Display-name rules (length, characters) and profile fields beyond display name: defaults chosen in the spec work; adjust before apply if the owner wants more.
- Real email provider and sender domain: deferred to a later change.

## Implementation notes (added during apply)

- Database connections force `timezone=UTC`: the driver sends JavaScript dates as zone-less UTC text, so a non-UTC server (found locally: Asia/Karachi) shifted token expiry by hours and made valid reset tokens look expired.
- The migration round-trip script now rolls back every migration in reverse and verifies the schema changes at each step and is empty at the end, then re-applies and compares with the original.
- pnpm's release-age check blocked NestJS 12.5.1 (published within a day); 12.4.2 is pinned instead and no exclusions were added.
