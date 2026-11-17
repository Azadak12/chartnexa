# Proposal

## Why

The backend can register, verify, sign in, refresh, recover and delete accounts, and the app has navigation that remembers where people were headed, but nobody can actually sign in from the app, so every signed-in screen is unreachable. This change connects the two: real account screens, secure on-device session storage, and automatic token refresh that never trips the server's refresh-token theft detection. It is the first change you can use end to end on a phone, and every later feature (courses, purchases, reviews, staff tools) depends on a working signed-in session.

## What Changes

- Add account screens: sign in, create account, email verification (by link or by pasting the code), forgot password, and reset password (by link or pasted code). All use the existing API with no backend change.
- Add session handling: the refresh token is stored only in the device's secure storage and the access token only in memory; the session is restored at launch; tokens refresh before they expire and once after a 401, as a single shared refresh so the same refresh token is never sent twice; a definitive refresh failure signs the person out and returns them to where they were after they sign in again; a temporary failure (offline) keeps them signed in.
- Add account management in the Profile tab: view the account and email-verification status with a resend action, edit display name, change password, list and end sessions (including "sign out everywhere"), sign out, and delete the account (password required).
- Show clear, honest feedback: field errors beside fields, plain messages for wrong password, too many attempts (with how long to wait), offline, and server problems; no response text is ever shown.
- Make password entry usable: masked fields with a labelled show/hide control, correct autofill and keyboard hints, and no password or token in logs or crash reports.
- Add a contract test that runs the app's auth client against the real API and a real PostgreSQL, so the app and server cannot drift apart unnoticed; CI's mobile job gains a PostgreSQL service for it.
- Show how to try it on a phone against the API on your computer (README), including the link format needed in Expo Go.
- **Not included:** Apple and Google sign-in (owner decision C19), staff roles or staff screens, biometric unlock, push notifications, offline sign-in, remembering email on the sign-in screen, any course or purchase screen, and a real email provider.

Assumptions (proposed, changeable before apply):
- No automatic sign-in after registering. The server answers registration identically whether or not the email exists (anti-enumeration), so signing in automatically would reveal existing accounts. The person is told to check their email and then signs in.
- Unverified accounts can sign in and browse; a banner offers resend. A verified email is required before purchase (later change).
- The verification and reset emails link to `chartnexa://verify-email?token=...` and `chartnexa://reset-password?token=...`. Expo Go cannot open `chartnexa://` links, so for testing in Expo Go the API's `APP_LINK_BASE` is set to the Expo Go address, and the screens also accept the code pasted by hand.
- Signing out always clears the device immediately; ending the session on the server is attempted but is best effort when offline (the server-side session then simply expires on its own schedule).
- The device label sent at sign-in is the platform and OS version (for example "iOS 18"), not a hardware identifier.

## Capabilities

### New Capabilities
- `mobile-account-access`: the screens and rules for creating an account, signing in, verifying email and recovering a password.
- `mobile-session-handling`: secure storage, restoring and refreshing the session, and what happens when it ends.
- `mobile-account-management`: the signed-in profile area: account details, name, password, sessions, sign out and deletion.

### Modified Capabilities
<!-- None. The app navigation rules (return-to, protected area) and the API are unchanged; this change uses them. -->

## Impact

- New: sign-in, register, verify-email, forgot-password, reset-password and profile sub-screens in `apps/mobile`; an auth client, a session manager and a secure token store; form handling; a contract test and CI service for it.
- Changes: the session store gains a restoring state so the app does not flash the wrong screen at launch; `apiFetch` can attach the token and retry once after refreshing; errors carry a retry-after value for rate limits; Profile becomes a small stack of screens.
- New dependencies (verify versions and Expo SDK 58 compatibility with `expo install`): `expo-secure-store`, `react-hook-form`, `@hookform/resolvers`.
- No backend changes and no new secrets. Tokens never appear in logs.
- Docs: `apps/mobile/README.md` (trying it on a phone, deep links in Expo Go), ADR-0004 note, a manual device checklist for secure storage and reinstall behavior.
- Out of scope: social login, biometrics, offline sign-in, staff screens, purchases.
