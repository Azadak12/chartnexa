# Tasks

## 1. Foundations

- [x] 1.1 Add `expo-secure-store`, `react-hook-form` and `@hookform/resolvers` using `expo install`/pnpm with versions, licenses and SDK compatibility verified; verify `pnpm install --frozen-lockfile`, typecheck and the production bundle export still pass.
- [x] 1.2 Implement the secure token store (versioned key, small JSON, delete on clear, accessibility setting) with an in-memory mock for Jest; verify tests that only the refresh token and session id are written, nothing else is persisted, clear deletes it, and a corrupted stored value is treated as no session.
- [x] 1.3 Extend `AppError` and `apiFetch` with `retryAfterSeconds`, an `authenticated` option and a device label header; verify tests for the Retry-After header parsed into the 429 message, unauthenticated calls not triggering sign-out on 401, the label sent, and auth request bodies never logged.
- [x] 1.4 Add the typed auth API layer using the contract schemas for requests and for parsing responses; verify tests that each call sends the contract-shaped body, rejects malformed server responses with a generic error, and never exposes server text.

## 2. Session handling

- [x] 2.1 Add the `restoring` state to the session store and update the root layout and guard so the splash and routes wait for restore; verify tests that no sign-in screen flashes while restoring and that existing navigation tests still pass.
- [x] 2.2 Implement the session manager sign-in, restore and sign-out (device cleared first, server call best effort, query cache cleared); verify tests for storing only the refresh token, restore success, restore rejection deleting the token, offline restore keeping the session stale, and offline sign out succeeding locally with the honest message.
- [x] 2.3 Implement single-flight renewal with proactive (under 60 seconds) and reactive (one retry after 401) triggers and the used-token guard; verify tests for many simultaneous requests causing one renewal, the new refresh token saved before the new access token is used, a second 401 ending the session, no refresh token ever sent twice, and a failed storage write keeping the new token in memory and retrying.
- [x] 2.4 Implement failure classes and foreground renewal; verify tests that a 401 on renewal signs out and returns the person to the same screen after sign-in, that offline, timeout, 5xx and 429 keep the session with a retryable error, and that returning to the foreground renews an expiring token.

## 3. Account access screens

- [x] 3.1 Build `PasswordField` and the shared form helpers (server error mapping, focus on first invalid field, keyboard-avoiding scroll); verify tests for masking, the labelled show/hide control changing its label, autofill and keyboard props, masking again on leaving the screen, and field errors announced with the field.
- [x] 3.2 Build the sign-in screen; verify tests for success going to the remembered destination or Home, one identical message for unknown email and wrong password with the password cleared, the 429 message with the wait and a disabled button until it passes, the offline message, field validation, and a double press sending one request.
- [x] 3.3 Build the create-account screen and confirmation; verify tests for success showing the check-your-email message without signing in, an identical confirmation for an existing email, server field errors beside the fields keeping typed values, and policy hints.
- [x] 3.4 Build the verify-email screen (link token or pasted code) and the unverified banner with resend; verify tests for success, one generic message for bad, used or expired codes, the deep link route reading the token, resend disabled while sending, and Sign in or Continue depending on session state.
- [x] 3.5 Build forgot-password and reset-password (link token or pasted code); verify tests for identical confirmation for any email, success sending the person to sign in, a weak password showing the reason beside the field without wasting the code, one generic message for bad codes with a link to request again, and the policy error mapping.
- [x] 3.6 Redirect signed-in people away from the public screens except the two link screens; verify navigation tests for each public screen while signed in and out, and that `returnTo` is still honored and sanitized after real sign-in.

## 4. Account management

- [x] 4.1 Build the Profile overview with the `me` query, verified indicator (text plus color), verification notice and states; verify tests for verified, unverified, loading, error with Retry, and that only the caller's data is shown.
- [x] 4.2 Build the display-name sheet; verify tests for saving, validation messages, focus returning to the edit control, the sheet closing on back without saving, and the updated name appearing.
- [x] 4.3 Build change password; verify tests for success keeping this device signed in, the wrong-current-password message beside that field with the wait message after repeated failures, policy errors beside the new field, and other sessions disappearing from the list afterward.
- [x] 4.4 Build the sessions screen with end-one, and sign-out-everywhere confirmations; verify tests for listing with this device marked and no secrets, ending another session, sign out everywhere returning to welcome, confirmations naming the consequence with a labelled cancel, and back closing a dialog without acting.
- [x] 4.5 Build account deletion with the warning, password confirmation and cleanup; verify tests for the wrong password leaving the account, success clearing storage and showing welcome, cancel restoring focus to the delete control, and the last-Admin refusal message being shown plainly.
- [x] 4.6 Convert Profile into a stack (index, sessions, change-password) and keep tab behavior; verify navigation tests that the Profile tab keeps its place when switching tabs and sign out returns to welcome.

## 5. Verification against the real API

- [x] 5.1 Add the `contract` Jest project that starts the built API on a scratch PostgreSQL database and exercises the auth layer and session manager over real HTTP; verify it passes locally for register, verify via the captured email token, sign in, refresh rotation, reuse safety, 401 renewal, password change revoking others, sessions list and end, deletion, and the rate-limit message.
- [x] 5.2 Add a log-hygiene test that spies on every console method across all flows (success and failure) and asserts no password, code or token appears; verify it fails when a deliberate `console.log` of a token is added, then remove it.
- [x] 5.3 Add the PostgreSQL service and API build step to the `mobile` CI job; verify the job is green on the pull request and red when a deliberate break is introduced in the auth layer's request shape.

## 6. Documentation and verification

- [x] 6.1 Update `apps/mobile/README.md` (try it on a phone against the API on your computer, starting the API with `APP_LINK_BASE` for Expo Go, pasting codes, what is stored where) and extend the manual checklist (Keychain or Keystore persistence, reinstall behavior, killing the app mid-refresh, airplane mode sign out, two devices); add an ADR-0004 note; verify by following the README in a fresh clone through register, verify, sign in, restart and sign out against the real API.
- [x] 6.2 Run the full `pnpm check` from a fresh clone, confirm CI is green, and record the evidence including what could not be verified on this machine.

## Evidence

- Local and fresh clone: `pnpm check` exit 0 with 157 mobile unit tests, 17 mobile contract tests that run the app's auth layer against the real API and PostgreSQL, 138 API tests, and the production bundle check. CI (`check`, `api`, `mobile`, `audit`) green on PR 16, including the contract tests with a PostgreSQL service.
- A throwaway PR that changed the register request shape failed the mobile contract tests and `check` and showed `mergeStateStatus: BLOCKED`; it was closed unmerged.
- README flow in a fresh clone: created a database, migrated, started the API with `APP_LINK_BASE` for Expo Go, registered (202), found the emailed link in the expected `exp://<ip>:<port>/--/verify-email?token=...` format, started Metro with `EXPO_PUBLIC_API_BASE_URL`, and the iOS development bundle (HTTP 200) contained the configured API address.
- Bugs found by the tests and fixed: the API returned 401 for a wrong confirmation password (now a 400 field error); the reconnect trigger could be swallowed by a failing renewal; the contract test's HTTP shim lacked Content-Length (test tooling only); overlay back handling could run after the router's.
- Not verified (no Xcode, Android SDK or device on this machine): Keychain and Keystore persistence and reinstall behavior, killing the app mid-renewal, airplane-mode flows on a device, two real devices, password-manager prompts, opening emailed links on a phone, screen-reader behavior. These are on the manual checklist in `apps/mobile/README.md` and none is claimed as verified.

## Workflow follow-up

- Review, then archive after verification. Next proposals: `instructor-permission-delegation`, `staff-mfa`, and the first course changes.
