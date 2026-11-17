# ADR-0004: Authentication

- **Status:** Proposed (decision needed)
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
