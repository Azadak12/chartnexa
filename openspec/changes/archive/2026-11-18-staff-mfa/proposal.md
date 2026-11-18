# Proposal

## Why

Admins and Managers can grant course access, change roles and read the audit trail, yet they sign in with a password alone. One reused or phished password gives an attacker all of that. The roadmap's `staff-mfa` change (Q15, proposed: TOTP required for Admin and Manager) adds a second step that a stolen password cannot pass, plus a recovery path so a lost phone does not lock out the only Admin.

## What Changes

- **Two-step sign-in for Admins and Managers.** After the password is accepted, a person with either role does not get a session yet. They get a short-lived, single-use **challenge** and must send a 6-digit code from an authenticator app (TOTP, RFC 6238) or one recovery code. Only then are tokens issued.
- **Enrollment is part of signing in.** A staff member who has not enrolled yet gets a **setup challenge** instead: the server creates a secret, the app shows the key (and an "Open authenticator app" link), the person enters the first code to prove it works, and only then are tokens issued and **10 one-time recovery codes** shown once.
- **Recovery:** a recovery code works once in place of a TOTP code and is recorded. If a person has lost both, another Admin can **reset** their two-step sign-in (reason required, audited, ends their sessions), and the operator command gets a reset option for a locked-out sole Admin, like the first-Admin recovery.
- **Rollout:** assigning the Manager or Admin role ends the person's existing sessions so their next sign-in goes through the new flow; one migration step does the same once for current Admins and Managers.
- **Protections:** the secret is stored encrypted; a code cannot be used twice; wrong codes are limited per challenge and per person; recovery codes are stored hashed; everything is audited without secrets.
- **App:** a code screen at sign-in (numeric keypad, one-time-code autofill, "Use a recovery code"), an enrollment screen, a recovery-codes screen that must be acknowledged, and Profile rows for staff ("Two-step sign-in: On", regenerate recovery codes).
- Verify against the real server with contract tests.
- **Not included:** Instructors and Students (Q15 covers Admin and Manager), SMS or email codes, passkeys and WebAuthn, "remember this device", push approvals, asking for a code again before sensitive actions, an in-app screen for an Admin to reset someone else (the API and the operator command exist; the screen comes later), and any change to password rules or password reset.

## Confirmation status

- Confirmed: first-party authentication (C18); staff roles are Admin, Manager and Instructor (R01 to R05); audit is append-only and holds ids only (R06); a lost sole Admin has an operator recovery (R07).
- Proposed here, needs owner approval: MFA required for Admin and Manager and not for Instructors (Q15); TOTP and recovery codes as the only methods; the library `otpauth` (MIT); ending existing staff sessions at rollout; Admin-assisted reset plus the operator command as the lost-device path.
- Pending and not decided: whether Instructors should also be required later; a hardware-key or passkey option; step-up checks for sensitive actions.

## Capabilities

### New Capabilities
- `staff-mfa`: the second sign-in step, enrollment, recovery codes and resets on the server.
- `mobile-staff-mfa`: the code, enrollment and recovery-code screens and Profile rows in the app.

### Modified Capabilities
<!-- None: sign-in behavior for staff is described by the new capability. -->

## Impact

- New: tables for MFA secrets, recovery codes and challenges (migration with `down.sql`), an MFA module in the API, shared schemas, new app screens, contract tests, a config value for the encryption key, one new dependency (`otpauth`, MIT; compatibility and size checked in task 1.1, with Node's own `crypto` as the fallback).
- Changes: `POST /auth/login` can answer with a challenge instead of tokens (the app is updated in the same change; no other client exists); the operator command gains a reset option; role assignment ends sessions for new Managers and Admins.
- Production needs an encryption key set (never committed); development and tests use a clearly marked non-secret default that the server refuses in production.
