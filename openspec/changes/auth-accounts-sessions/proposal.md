# Proposal

## Why

Every protected feature (courses, entitlements, reviews, staff tools) needs to know who is calling. The baseline accepted a first-party login design but left ADR-0004 open; the owner has now chosen first-party. The API skeleton (`api-foundation`) exists but has no users, sessions or authentication guard. Building this next unblocks `rbac-core-and-audit`, entitlements and everything after, and settles security-sensitive behavior (token rotation, reset abuse, account deletion) while the codebase is still small.

## What Changes

- Add accounts: register with email and password, verify email, view and update own profile basics, delete account (in-app deletion is required by both app stores).
- Add authentication: login, short-lived access tokens, rotating refresh tokens with reuse detection, logout, logout everywhere, and a list of the user's active sessions with per-session revoke.
- Add an authentication guard for the API: protected routes answer 401 in the standard error envelope without a valid token; a disabled or deleted account or a revoked session stops working immediately.
- Add password recovery: forgot-password, reset with a single-use expiring token (which signs out all sessions), and change-password for a signed-in user.
- Add abuse protection: rate limits on register, login, refresh, forgot-password and verification resend; responses that do not reveal whether an email is registered; equalized timing for unknown accounts.
- Add a mailer interface for verification and reset emails with a development-only sender and a test sender. No real email provider is chosen in this change.
- Add the persistence and migrations for users, sessions, email and reset tokens, and rate-limit counters, each with a tested `down.sql`.
- Accept ADR-0004 as first-party and record the decisions below in the decision register.
- **Not included:** roles, permissions, staff accounts and first-Admin bootstrap (`rbac-core-and-audit`); MFA for staff (`staff-mfa`); Apple and Google sign-in (later change, owner decision); a real email provider; mobile screens; audit-log tables (auth events go to structured logs for now); entitlements and purchases.

Owner decisions applied (2026-11-17): first-party auth; social login later; mailer interface with development-only sender.

Assumptions (proposed, changeable before apply):
- Every account created here is a student. Role assignment and staff accounts arrive with `rbac-core-and-audit`.
- Unverified accounts can sign in and browse; a verified email will be required before purchase (enforced in the payments change).
- Password policy: 10 to 128 characters, not equal to the email, not on a built-in common-password list. No composition rules.
- Access tokens last 10 minutes; refresh tokens last 30 days, sliding per rotation, with a hard cap of 90 days per session.
- Account deletion immediately removes personal data and ends all sessions; records needed later for purchases keep only the anonymous user id. Exact retention is pending Q10 and legal review.
- Rate limits are stored in PostgreSQL (the API stays stateless and Redis stays deferred).

## Capabilities

### New Capabilities
- `account-lifecycle`: registering, verifying email, reading and updating one's own profile, and deleting the account.
- `authentication-sessions`: logging in, access and refresh tokens, rotation and reuse detection, logout, session listing and revocation, and the authentication guard.
- `password-recovery`: forgot, reset and change password.
- `auth-abuse-protection`: rate limiting, anti-enumeration responses and timing behavior for authentication endpoints.

### Modified Capabilities
<!-- None. api-platform's error envelope and log redaction already cover these endpoints; this change only uses them. -->

## Impact

- New: auth module under `apps/api/src/modules`, Prisma models and migrations, `.env.example` entries (placeholders), shared request and response schemas in `packages/api-contracts`.
- New dependency: `jose` (JWT signing and verification, MIT). Password hashing uses Node's built-in Argon2id, so no native add-on is needed; verify availability and parameters at apply.
- New config (validated at startup): access-token secret, token lifetimes, mailer driver, app link base.
- Docs: ADR-0004 status, decision register, API README.
- Out of scope: roles and permissions, MFA, social login, real email delivery, mobile UI, deployment, Redis.
