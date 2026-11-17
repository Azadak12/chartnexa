# ADR-0004: Authentication

- **Status:** Accepted (owner, 2026-11-17): first-party
- **Date:** 2026-11-17
- **Related:** Q14, Q15, X07

## Context
Students, instructors, managers and admins sign in. Stores require in-app account deletion; offering third-party login requires Sign in with Apple.

## Decision (proposed default)
First-party email/password with Argon2id, short-lived access tokens and rotating hashed refresh tokens with reuse detection, plus Apple and Google OIDC. TOTP MFA required for Admin and Manager. Tokens stored in secure device storage. Authorization data stays in our own database regardless of provider.

## Alternatives considered
- Managed IdP (Auth0, Clerk, Cognito): lower security-implementation risk, per-MAU cost grows with user count, vendor lock-in.
- Passwordless only: fewer secrets to store, depends on email deliverability.

## Consequences
First-party means we own reset-abuse, rate limiting and token-rotation correctness (all need negative tests). Final choice requires owner input on cost vs control.

## Update 2026-11-17: owner decisions
- First-party authentication chosen over a managed provider.
- Apple and Google sign-in deferred to a later change (neither is offered now, so Sign in with Apple is not required yet).
- Email verification and reset use a mailer interface with a development-only sender; no real email provider is chosen yet.
- Implemented by OpenSpec change `auth-accounts-sessions`: Argon2id via Node's built-in `crypto.argon2` (64 MiB, 2 passes, 1 lane, about 67 ms measured locally), 10-minute HS256 access tokens without roles or permissions, rotating hashed refresh tokens with reuse detection, Postgres-backed rate limits. Staff MFA remains a separate change.

## Implementation note 2026-11-17 (`mobile-auth`)
The app stores only the refresh token and session id in the device's secure storage and keeps the access token in memory. One shared renewal, new-token-saved-before-use and a "never send a used refresh token" guard keep the server's refresh-token theft detection from ending honest sessions; a 401 triggers one renewal and one retry. Found while building: a wrong confirmation password on delete and change-password returned 401, which a client rightly reads as "signed out"; the API now returns a 400 field error instead. A contract test runs the app's auth layer against the real API and PostgreSQL.
