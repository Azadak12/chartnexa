# Tasks

## 1. Server foundations

- [x] 1.1 Check `otpauth` (license, Node 26, size, install scripts) and write a thin `totp.ts` around it (or Node `crypto` if it fails); verify unit tests against the RFC 6238 test vectors, steps t-1 and t+1 accepted, t-2 refused, wrong length refused, and the `otpauth://` URI format.
- [x] 1.2 Add the encryption helper and config (`MFA_ENCRYPTION_KEY`, limits, challenge lifetime) with production refusal of the development key; verify tests for round trip, tampering detection, wrong key, a fresh nonce each time, and that production start fails without a real key.
- [x] 1.3 Add the three tables and constraints as a migration with reviewed `down.sql` and the one-time session revocation for current Admins and Managers; verify `pnpm migrate:roundtrip` and tests that the database refuses a second unused challenge per person and kind, a bad kind, attempts out of range, and an orphan row, and that the revocation ends only admin and manager sessions.

## 2. Server behavior

- [x] 2.1 Add the contracts (login response union, verify, setup, recovery regenerate, reset) to `packages/api-contracts`; verify unit tests for each shape, 6-digit and recovery-code formats, and that password-only responses still parse.
- [x] 2.2 Implement the MFA service and the gate in login (challenge creation, verify with replay protection, attempts and per-person limits, generic failures); verify integration tests for every scenario in `staff-mfa` under "cannot get a session", "challenges", and "valid TOTP", including simultaneous codes, expiry, reuse, burn after 5, disabled and role-removed between steps, and no tokens at any failure.
- [x] 2.3 Implement enrollment (start and complete) and recovery codes (use, regenerate); verify tests for abandoned setup, already enrolled, 10 codes once, one-time use, reuse refusal, constant-time path, and regenerate invalidating the old set.
- [x] 2.4 Implement the Admin reset, session ending on promotion, the deletion hook and the operator `--reset-mfa`; verify tests for Admin only, self refused, Manager and Instructor refused, sessions ended, setup required after reset, promotion ending sessions, account deletion removing credentials, and the operator command including its audit record.
- [x] 2.5 Prove no secrets leak: tests that logs, audit rows and error bodies never contain codes, secrets, challenge tokens or recovery codes across all flows; update the OpenAPI route check in CI and verify it fails when a route is removed.

## 3. App

- [x] 3.1 Build the code screen, recovery-code option, expired and burned challenge handling in the sign-in flow; verify component tests for every scenario in `mobile-staff-mfa` under sign-in, including double submit, wrong code, focus and announcements.
- [x] 3.2 Build enrollment (key with groups, copy, open authenticator, first code) and the recovery-codes screen with acknowledgement and leave warning; verify component tests for each scenario, including no authenticator installed and leaving early.
- [x] 3.3 Add the Profile rows and regenerate flow for staff only; verify tests for Admin, Manager, Instructor and Student.

## 4. Closing

- [x] 4.1 Add contract tests against the real API: staff enroll, sign out, sign in with code, recovery code use, replay refused, Admin reset, promotion forcing enrollment, and Student and Instructor unaffected.
- [ ] 4.2 Run mutation checks on the gate, the replay protection, challenge single use and limits, the recovery-code consumption and the reset permission; record results.
- [ ] 4.3 Update READMEs (setup, key generation, operator reset, rollout sign-out), the manual device checklist and the decision register (Q15 answer) after the owner answers; write evidence listing what ran and what was not verified on devices or with real authenticator apps.
- [ ] 4.4 Run the full checks and `openspec validate staff-mfa`; after review and merge, archive with `openspec archive`.
