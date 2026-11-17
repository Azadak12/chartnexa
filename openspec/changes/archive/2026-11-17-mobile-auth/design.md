# Design

## Context

Backend: `/auth/register|login|refresh|logout|logout-all|email/verify|email/resend|password/forgot|password/reset`, `/me`, `PATCH /me`, `DELETE /me`, `POST /me/password`, `GET /me/sessions`, `DELETE /me/sessions/:id`. Refresh tokens rotate on every use; reusing a rotated token (or two simultaneous uses of one) revokes the whole session; access tokens last 10 minutes; rate limits answer 429 with `Retry-After`; registration and forgot-password answer identically whether or not the email exists; emails link to `chartnexa://verify-email?token=` and `chartnexa://reset-password?token=` using `APP_LINK_BASE`. Shared Zod request and response schemas are in `@chartnexa/api-contracts`.

App (`apps/mobile`): Expo SDK 58, Expo Router, protected `(app)` group with validated `returnTo`, a session store (`signed-out` or `signed-in`), `apiFetch` with plain-language `AppError`s and a request id, `StateView`/`QueryStateView`, overlay-aware `BottomSheet`/`Dialog`, `Button` with loading, `TextField` with linked errors, tokens and contrast rules, 78 tests. Profile is a placeholder with a sign-out button. No Xcode or Android SDK is available on the build machine; device behavior is verified manually by the owner. ADR-0001 chose React Hook Form with Zod for forms; ADR-0004 chose first-party auth.

## Goals / Non-Goals

**Goals:** working sign-in to sign-out on a phone; a session that survives restarts and renews safely; no secrets in logs or ordinary storage; the app and API verified against each other by an automated contract test.
**Non-Goals:** social login, biometrics, offline sign-in, remembered email, staff screens, push, purchases, a real email provider.

## Decisions

1. **Layers.** `src/auth/token-store.ts` (secure storage wrapper), `src/auth/auth-api.ts` (typed calls using contract schemas and parsing responses), `src/auth/session-manager.ts` (restore, renew, sign out; the only owner of tokens), then screens and forms on top. Screens never touch tokens; they call the manager and the API layer.
2. **Storage.** `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` accessibility (Keychain on iOS, Keystore on Android), key names versioned (`chartnexa.session.v1`), value a small JSON of refresh token and session id. The access token and its expiry live only in memory. Alternative: AsyncStorage (not encrypted, rejected). iOS Keychain items survive app deletion, so a reinstalled app may find an old token; it is simply rejected or expired and removed (recorded as a manual-check item).
3. **Session states.** The session store gains `restoring` so guards and the splash wait for restore. Order at launch: hold the splash, read secure storage, if a token exists call refresh, then set `signed-in` or `signed-out`, then hide the splash. Offline at launch with a stored token sets `signed-in` in a "stale" state (no access token yet) and renews when the network returns.
4. **Single-flight renewal.** The manager keeps one in-flight renewal promise; every caller awaits the same promise. Renewal writes the new refresh token to secure storage and updates memory before resolving. If the write fails, the new token is kept in memory as the source of truth and the write is retried, because losing a rotated token would cause the next renewal to reuse the old one and revoke the session. The manager never sends a refresh token it has already used, enforced by a "used" check in code and tests.
5. **Proactive and reactive renewal.** The access token is renewed when it has under 60 seconds left (checked before each authenticated request and when the app returns to the foreground) and once after a 401. A request retried after renewal is not retried again; a second 401 ends the session.
6. **Failure classes.** Renewal result 401 means ended: clear storage, set `signed-out`, remember the current location as `returnTo` (the guard already does this), show "Your session ended". Network, timeout, 5xx or 429 mean unreachable: keep the session and report a retryable error. Renewal is retried with backoff in the background while signed in and online.
7. **`apiFetch` integration.** Add an `authenticated` option (default true for non-auth endpoints) that obtains a token from the manager and applies the retry rule. Authentication endpoints (login, register, forgot, reset, verify) are called unauthenticated and their 401 does not trigger a sign-out. `AppError` gains `retryAfterSeconds` parsed from the `Retry-After` header; messages for 429 include the wait.
8. **Forms.** React Hook Form with the contract Zod schemas through `@hookform/resolvers`, `mode: "onSubmit"` then revalidate on change, server field errors mapped with `setError`, submit disabled while sending through the existing `useSubmitOnce`. Password fields share one `PasswordField` component (masked, labelled show/hide button, `autoComplete` of `current-password` or `new-password`, no autocorrect or capitalization, `textContentType`), and forms wrap in a keyboard-avoiding scroll view. Sign-in clears the password field on failure.
9. **Routes.** Public: `/welcome`, `/sign-in`, `/register`, `/forgot-password`. Reachable signed in or out: `/verify-email` and `/reset-password` (read `token` from the link; a manual code field is also shown). Signed in: `/profile` becomes a stack with `index`, `sessions` and `change-password`; display name edit and destructive confirmations use `BottomSheet` and `Dialog`. The public group redirects a signed-in person to Home (except the two link screens).
10. **Registration without auto sign-in.** The success screen says to check email, then offers Sign in. This keeps the server's anti-enumeration guarantee intact on the client. After a verification link succeeds the screen offers Sign in or Continue depending on session state.
11. **Device label.** `x-device-label: "<platform> <OS version>"` (for example "iOS 18.1", "Android 15"), set once by the API layer; sessions list shows it.
12. **Account overview.** A TanStack Query `me` query (stale after 30 seconds) feeds Profile and the verification banner; mutations invalidate it. Sessions list uses its own query. Sign-out and deletion clear the query cache.
13. **Sign out.** `signOut()` clears secure storage, memory and the query cache first, sets `signed-out`, then makes a best-effort `/auth/logout` call with the old access token (and does not block the UI or fail visibly). "Sign out everywhere" waits for the server and only clears locally on success or on a definitive 401, and says so if it could not reach the server.
14. **Logging.** No auth value is ever passed to `console`; the API layer redacts request bodies for auth routes; the existing error mapping never exposes response text. A test spies on all console methods across every flow and asserts no password, code or token appears.
15. **Contract test.** A Jest project `contract` starts the real API (built output) against a scratch PostgreSQL database, with the memory mailer exposed through a test-only hook, and runs the app's auth layer and session manager against it using real HTTP: register, verify, sign in, refresh rotation and reuse safety, 401 renewal, password change revoking others, sessions list, delete, rate limit message. Locally it uses the Homebrew PostgreSQL like the API tests; CI's `mobile` job adds a `postgres:16` service. Alternative considered: mocking fetch only, rejected because it cannot catch drift in request or response shapes.
16. **Mail links in Expo Go.** Expo Go opens `exp://<host>/--/<path>` rather than `chartnexa://`. For manual testing the API is started with `APP_LINK_BASE=exp://<lan-ip>:8081/--/` so emailed links open in Expo Go; development builds use `chartnexa://`. Both formats map to the same routes. Documented in the README.
17. **Accessibility.** Every control has a label and role (existing components), errors are linked to fields and announced, focus moves to the first invalid field on a failed submit, success and failure messages use `accessibilityLiveRegion`, and confirmation dialogs name the consequence. Device-reader behavior is on the manual checklist.

## Risks / Trade-offs

- Losing a rotated refresh token revokes the session (server strictness) -> persist before use, keep memory as source of truth, retry writes, test concurrency; killing the app between server rotation and local write remains a rare residual risk, documented.
- iOS Keychain outlives uninstall -> stale tokens are rejected and cleared; manual check.
- Expo Go cannot open `chartnexa://` links -> pasted-code fallback and Expo Go link base for testing.
- Secure storage behaves differently on emulators or rooted devices -> noted; no custom crypto.
- Server 429 lockouts could frustrate honest users -> messages state the wait; limits are server configuration.
- A contract test needs PostgreSQL and a built API in the mobile CI job -> a service container and an API build step; added to the required `mobile` check only after it passes once.
- Offline sign out leaves the server session alive until it expires -> stated to the person; "sign out everywhere" is available when online.

## Migration Plan

Additive. The `restoring` state is a new value of an existing store, and existing navigation tests set the state explicitly. Rollback reverts the change; no backend or data changes. CI gains a service and an API build step in the `mobile` job.

## Open Questions

- Whether to offer a "remember my email" convenience later (privacy trade-off), decided with product.
- Final wording and tone of messages, reviewed with real users later.

## Implementation notes (added during apply)

- **Backend change found by building the client:** `DELETE /me` and `POST /me/password` answered 401 for a wrong confirmation password. A client treats 401 as "your session is invalid" and would sign the person out for a typo. The API now returns a 400 with a field error (`password` or `currentPassword`) and still counts the failure toward the per-user limit. API tests and specs of behavior were updated (the proposal had said "no backend change").
- Overlay back handling now registers its back listener only while an overlay is open, so it always runs before the router's own back handling.
- The contract test starts the real API through `apps/api/scripts/test-server.ts` (throwaway database, development mailer writing to a temporary directory the test reads) instead of exposing any test hook in the API.
- `apiFetch` reads `EXPO_PUBLIC_API_BASE_URL` directly (inlined at build time by Expo) before the app config value.
- `expo-router` unit tests cannot render the native tab bar, so tab presses are simulated with the same navigation action; Android hardware back on a visible Modal and the back-button mock both exercise the overlay stack.
- Session state is a three-value store (`restoring`, `signed-out`, `signed-in`) plus an optional notice shown on the next signed-out screen.
