# Tasks

## 1. Decisions and configuration

- [x] 1.1 Set `docs/adr/0004-authentication.md` to Accepted (first-party) with the owner decisions, and add them to `docs/10_DECISION_REGISTER.md`; verify the ADR status line and register entries read correctly.
- [x] 1.2 Verify `crypto.argon2` on the pinned Node, choose and document Argon2id parameters, and verify `jose` version, license and peer needs; verify with a benchmark script that one hash takes about 50-150 ms locally and record the numbers in `apps/api/README.md`.
- [x] 1.3 Add auth config (`ACCESS_TOKEN_SECRET`, optional previous secret, TTLs, rate-limit settings, `MAILER_DRIVER`, `APP_LINK_BASE`, `TRUST_PROXY`) to config validation and `.env.example`; verify tests for missing/short secret (names variable, never the value) and that `dev`/`memory` mailer drivers fail startup when `NODE_ENV=production`.

## 2. Data model

- [x] 2.1 Add Prisma models and a migration with `down.sql` for `users` (partial unique index on lowercased live email via raw SQL), `sessions`, one-time token tables and `rate_limits`; verify `pnpm migrate:roundtrip` passes and a test shows two live accounts cannot share an email in different case while a deleted account's email is reusable.
- [x] 2.2 Add shared Zod schemas and types for all auth requests and responses to `packages/api-contracts`; verify unit tests for valid and invalid payloads and that built packages typecheck.

## 3. Core services

- [x] 3.1 Implement the password policy and Argon2id hashing service with PHC-style strings and rehash-on-login; verify tests for policy rules, correct and wrong passwords, parameter upgrade and that no hash or password is ever logged.
- [x] 3.2 Implement access-token signing/verification with secret rotation; verify tests for expiry, wrong key, tampered payload, previous-key acceptance, and that decoded tokens contain no email or permission claims.
- [x] 3.3 Implement the Mailer interface with `memory` and `dev` (file outbox, git-ignored) drivers and plain-text templates; verify tests that messages are captured and that dev outbox files never appear in logs.
- [x] 3.4 Implement the Postgres rate limiter with atomic upserts; verify integration tests for limit enforcement, window expiry, shared counting across two app instances, and a 429 envelope with a retry hint.

## 4. Accounts

- [x] 4.1 Implement registration with anti-enumeration behavior and concurrent-safe uniqueness; verify integration tests for success, weak password, existing email (uniform response plus owner notice), and two simultaneous registrations producing one account.
- [x] 4.2 Implement email verification and resend with single-use hashed tokens; verify tests for success, reuse, expiry, unknown token (identical generic error) and concurrent redemption yielding one winner.
- [x] 4.3 Implement `GET/PATCH /me` and the authentication guard with `@Authenticated()` and `currentUser`; verify tests for 401 on missing, malformed, wrong-key and expired tokens, own-data-only access, and that a disabled account is rejected on the next request.
- [x] 4.4 Implement account deletion with password re-entry, data erasure and session revocation; verify tests for success, wrong password, old credentials failing, email re-registration, and that no personal data remains in the user row.

## 5. Sessions

- [x] 5.1 Implement login with timing equalization and uniform errors; verify tests for valid, wrong password, unknown email (same status and body), case-insensitive email, and a timing check that unknown-email login still performs a hash.
- [x] 5.2 Implement refresh rotation with transactional row lock and reuse detection; verify tests for rotation, reuse of an old token revoking the session, two simultaneous refreshes with one token, sliding expiry and the 90-day cap.
- [x] 5.3 Implement logout, logout-all, session listing and per-session revoke; verify tests for immediate access-token rejection, listing only own sessions with the current one marked, and revoking another user's session returning not found.

## 6. Password recovery

- [x] 6.1 Implement forgot-password with identical responses for known and unknown emails; verify tests for uniform status/body, email sent only for registered accounts, and per-email rate limiting.
- [x] 6.2 Implement reset-password with single-use expiring token, policy check, invalidation of sibling tokens and revocation of all sessions; verify tests for success, reuse, expiry, disabled or deleted account (generic error) and concurrent redemption.
- [x] 6.3 Implement change-password with current-password check and revocation of other sessions; verify tests for success, wrong current password counting toward limits, and the current session surviving.

## 7. Cross-cutting verification and docs

- [x] 7.1 Add log-hygiene integration tests running the full auth flows with captured logs; verify no password, token, hash, reset link or email appears in structured logs and security events carry only request, user and session ids.
- [x] 7.2 Update the OpenAPI document and verify CI's OpenAPI check lists every auth route, the error envelope on 401/429, and no token values in examples.
- [x] 7.3 Update `apps/api/README.md` (auth overview, config, rate limits, mailer, trusted proxy, tuning Argon2) and `.env.example`; verify by following the README in a fresh clone.
- [x] 7.4 Run the full `pnpm check` and migration round trip from a fresh clone and confirm CI (`check`, `api`, `audit`) is green on the pull request; record the evidence.

## Evidence

- Local: `pnpm check` exit 0 with 95 API tests (unit and real-PostgreSQL integration), 6 contracts tests; `pnpm migrate:roundtrip` OK for 2 migrations (every migration rolled back in reverse and re-applied); `pnpm bench:argon2` 63 ms per hash.
- CI on PR 9: `check`, `api`, `audit` green on the first run.
- Fresh clone of the branch: install from the lockfile, `pnpm check` exit 0 (95 API tests), round trip OK; then following the README: created a database, `migrate:deploy`, started the server, registered (202), found the verification email in `.dev-mail/` (git-ignored), logged in (expiresIn 600), `GET /me` returned the account, `GET /me` without a token returned 401, and the server log contained neither the email nor the password.
- Defect found and fixed during apply: PostgreSQL on this machine uses the Asia/Karachi timezone, and the driver sends JavaScript dates as zone-less UTC text, so expiry times shifted by 5 hours and valid reset tokens looked expired. Connections now force `timezone=UTC`, with a regression test.
- Not verified: behavior under a real email provider, production proxy settings, and load (no capacity claims are made).

## Workflow follow-up

- Review, then archive after verification. Next proposals: `rbac-core-and-audit` and `mobile-shell-and-tokens`.
