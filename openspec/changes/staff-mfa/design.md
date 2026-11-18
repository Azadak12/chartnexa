# Design

## Context

`AuthService.login` checks the password (rate limited, dummy hash for unknown emails) and calls `SessionsService.createSession`. Roles live in `user_roles` (`RolesService`); audit is `AuditService`; rate limits are `RateLimiterService`; one-time tokens are hashed with helpers in `tokens/token-util.ts`; the operator command `admin:bootstrap` exists with a `--recovery` flag; account deletion has hooks; the app has sign-in, session manager and Profile screens.

## Decisions (proposed)

1. **Module `modules/mfa`** with a service, controller, crypto helpers and a deletion hook; `AuthService` asks `MfaService.requirementFor(user)` after the password check and returns a challenge or the token pair. `mfa` imports identity and access through their indexes; identity depends on it only through a small interface (`MfaGate`) so the import graph has no cycle.
2. **Who needs it:** an active `admin` or `manager` role (the same read `AuthorizationService` already does). Computed at sign-in time from the database.
3. **Data:** `mfa_credentials(user_id PK FK, secret_ciphertext, secret_iv, secret_tag, enabled_at, last_used_step bigint)`, `mfa_recovery_codes(id, user_id FK, code_hash, used_at)`, `mfa_challenges(id, user_id FK, kind 'verify'|'setup', token_hash unique, pending_ciphertext/iv/tag null, attempts int, expires_at, used_at)`. CHECKs: kind and attempts range, `enabled_at` set when `last_used_step` set; a partial unique index keeps one unused challenge per person and kind (a new sign-in replaces the old one). Setup secrets live encrypted on the challenge row and move to `mfa_credentials` only when the first code is verified, so abandoned setups leave nothing enabled.
4. **TOTP:** SHA-1, 6 digits, 30 seconds, as every authenticator app expects. Library `otpauth` (MIT) for code generation and verification; task 1.1 confirms it installs and runs on Node 26 and passes the RFC 6238 test vectors, with Node's built-in `crypto` HMAC as the fallback if it does not. Accept steps t-1, t, t+1; store `last_used_step` and refuse any step less than or equal to it (a conditional `UPDATE ... WHERE last_used_step < $step` decides concurrent attempts).
5. **Secret at rest:** AES-256-GCM, a random 12-byte nonce per secret, key from `MFA_ENCRYPTION_KEY` (32 bytes, base64). The default is a development constant that `loadConfig` rejects when `NODE_ENV=production`. Key rotation is out of scope (the format stores no key id; a later change can add one).
6. **Challenge tokens:** 32 random bytes (base64url), stored as a hash, 5-minute expiry, single use, at most 5 wrong codes then deleted, and counted in the existing rate limiter per person (`mfa:user:<id>`, window and limit from config) so rotating through new challenges does not help. Generic failures: one message for expired, used, unknown and wrong.
7. **Recovery codes:** 10 codes of 12 characters from an unambiguous alphabet, displayed as `xxxx-xxxx-xxxx`; stored as SHA-256 of the normalized code (they carry about 59 bits of randomness, so a fast hash is acceptable and lookups stay cheap), compared in constant time; consuming one is `UPDATE ... WHERE used_at IS NULL`.
8. **Endpoints:** `POST /auth/login` returns either the existing token pair or `{ status: "mfa_required" | "mfa_setup_required", challengeToken, expiresInSeconds }`; `POST /auth/mfa/verify { challengeToken, code }` (6 digits or a recovery code); `POST /auth/mfa/setup/start { challengeToken }` returns `{ secret, otpauthUri }` once; `POST /auth/mfa/setup/complete { challengeToken, code }` returns tokens and recovery codes; authed `POST /me/mfa/recovery-codes { password, code }` regenerates; `POST /staff/users/:id/mfa/reset { reason }` (permission `roles:manage`, Admin only; refuses self).
9. **Rollout:** a migration statement revokes sessions of users with an active admin or manager role; `RolesService.assignRole` ends the target's sessions when the new role is manager or admin (same transaction).
10. **Operator command:** `admin:bootstrap --reset-mfa --email <address>` removes credentials and recovery codes, ends sessions and writes a system audit record, mirroring `--recovery`.
11. **App:** a small state machine on the sign-in screen (`credentials` to `code` or `setup` to `recovery-codes` to signed in). The challenge token and secret are held in component memory only. The session manager receives tokens exactly as after a normal login. Screens use existing `Screen`, `FormField` and `useSubmitOnce`.
12. **Audit actions:** `mfa.enroll`, `mfa.recovery_used`, `mfa.recovery_regenerate`, `mfa.reset` (and `mfa.reset` from the operator as a system actor). Failures write no audit rows (the rate limiter and request logs carry ids and outcomes), to avoid letting an attacker fill the trail.

## Threat model (short)

- Stolen password: no tokens without a code; challenge limits and per-person limits block guessing a 6-digit code.
- Phished code: the code works once and only for one challenge; this does not stop real-time relay phishing, which needs passkeys (out of scope, recorded).
- Replay and races: step tracking with a conditional update; challenge single use.
- Database leak: secrets encrypted; recovery codes hashed; challenge tokens hashed.
- Account takeover through recovery: codes shown once, only a signed-in staff member can regenerate with password and a current code, resets are Admin-only and audited, operator reset needs database access.
- Locked-out sole Admin: operator reset option.
- Downgrade: no endpoint removes a person's own second step; resets also end sessions.
- Timing and enumeration: generic failures, constant-time comparisons, no difference between unknown challenge and wrong code.

## Migration and rollback

Additive tables plus a one-time session revocation statement. `down.sql` drops the tables; rollback re-allows password-only staff sign-in (and the revocation is not reversible, which is harmless).

## Risks / Trade-offs

- Staff who lose both device and codes depend on another Admin or the operator; a single-Admin academy depends on the operator command (documented, as with bootstrap).
- TOTP is phishable in real time; accepted for now and recorded.
- Ending sessions at rollout signs staff out once; announced in the README.
- Adding a dependency: small and pinned; fallback is Node `crypto`.

## Open Questions (owner)

1. Require two-step sign-in for Admins and Managers, not for Instructors? (Proposed: yes.)
2. Use `otpauth`, falling back to Node crypto if it fails the checks? (Proposed: yes.)
3. End existing staff sessions at rollout and on promotion? (Proposed: yes.)
4. Lost device: Admin reset plus operator command, no self-service removal? (Proposed: yes.)
