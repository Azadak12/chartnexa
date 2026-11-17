# Tasks

## 1. Project setup and compatibility spike

- [x] 1.1 Scaffold `apps/mobile` with the current Expo SDK using `expo install`, verify each package's license and compatibility, and verify the spike: `pnpm install --frozen-lockfile` succeeds, `expo export` produces iOS and Android bundles in the pnpm workspace, and the result (including any needed Metro or linker setting) is recorded in `apps/mobile/README.md`.
- [x] 1.2 Add `app.config.ts` (name, slug, scheme, light UI, placeholder identifiers, public API base URL only) and `.env.example` entry; verify the config loads with `expo config` and contains no secrets.
- [x] 1.3 Add mobile typecheck, lint (React hooks rules) and `jest-expo` test setup with a smoke test; verify `pnpm check` runs them and fails on a deliberate type error, then remove it.

## 2. Design tokens

- [x] 2.1 Expand `packages/design-tokens` with neutrals, status colors, spacing, radii, type scale, touch size and a `contrastRatio` function plus the approved pairing list; verify Vitest tests for exact brand values, every normal-text pairing at 4.5:1 or more, every large-text and control-border pairing at 3:1 or more, and a failing example pairing being detected.
- [x] 2.2 Load Inter with a system fallback and a splash timeout; verify tests that the app renders with the system font when loading fails or is slow and that only the intended weights are requested.

## 3. Base components

- [x] 3.1 Build `Text`, `Screen` and `Card` from tokens; verify tests that text allows scaling up to 2x, no fixed text heights are set, the screen background is white, and screens use token values only (a lint or test check finds no literal hex colors in `src/`).
- [x] 3.2 Build `Button` with all states and `useSubmitOnce`; verify tests for variants, disabled and loading states ignoring presses, a double tap running the action once, accessibility role, label and state, and a 44-point target.
- [x] 3.3 Build `IconButton` with a required label; verify tests for the 44-point target via hit area, rejection of a missing label in development, and that its label is exposed to assistive technology.
- [x] 3.4 Build `TextField` with linked error text; verify tests that the label is visible, the error appears beside the field and is announced with it, and meaning does not rely on color.
- [x] 3.5 Build `Banner` and `Skeleton`; verify tests that banners include an icon and text for each status and that the skeleton does not animate when reduced motion is on.
- [x] 3.6 Build `OverlayProvider`, `BottomSheet` and `Dialog` with focus return; verify tests for opening and closing, back closing the topmost overlay first (including nested), the screen underneath unchanged, and focus returning to the opener.

## 4. Navigation

- [x] 4.1 Add the router skeleton (public group, guarded app group with tabs, placeholder screens, course detail, not-found, dev-only gallery) and the session provider; verify navigation tests that a signed-out visit to a protected route redirects to sign-in and a signed-in session shows the tabs.
- [x] 4.2 Implement `sanitizeReturnTo` and the return flow; verify tests that a deep link with params returns to the same screen after sign-in, no destination goes to Home, session expiry returns to the same screen, and external URLs, double-slash, scheme, backslash, `..`, control characters, oversized values and the sign-in route itself all fall back to Home.
- [x] 4.3 Wire the hardware back handler to the overlay stack; verify tests that back closes a sheet before navigating, closes a dialog before a sheet, navigates back with no overlay, and leaves the underlying screen unchanged.
- [x] 4.4 Implement `ScreenMemory` hooks for scroll offset and filters; verify tests that returning to a list restores both, a different list keeps its own state, and sign-out clears the memory.
- [x] 4.5 Verify tab state and not-found behavior; tests that switching tabs and returning keeps each tab's screen, and an unknown deep link shows the not-found screen with a working Home button and no technical text.

## 5. Screen states and API client

- [x] 5.1 Implement `apiFetch` and the `AppError` mapping; verify tests with mocked responses for each error code to its message, field errors, the request id support reference, network failure distinct from server error, a non-envelope body showing only a generic message, timeout, and that response text never reaches the UI.
- [x] 5.2 Build `StateView` and `QueryStateView` and the query client defaults; verify tests for loading, empty, error with a working Retry, offline and unauthorized rendering, and no automatic retry on 4xx.
- [x] 5.3 Build `OfflineBanner` with NetInfo and wire TanStack Query's online manager; verify tests that the banner appears when offline, content stays mounted, and the banner disappears when connectivity returns.
- [x] 5.4 Handle 401 through the session boundary; verify a test that a 401 shows the unauthorized state, offers sign-in and returns to the same screen afterward.

## 6. CI, documentation and verification

- [x] 6.1 Add the `mobile` CI job (frozen install, typecheck, tests, `expo export` for iOS and Android); verify it is green on the pull request and red when a deliberate type error is added, and the dev-only gallery is absent from the exported production bundle.
- [x] 6.2 After the `mobile` job has passed once, add it to the required checks on `main`; verify a failing mobile job blocks the merge state.
- [x] 6.3 Write `apps/mobile/README.md` (run with Expo Go, API address for emulator and device, SDK version, structure, how to add a screen) with the manual device checklist (hardware back, iOS swipe-back, Dynamic Type and Android font size, VoiceOver, TalkBack, reduced motion, offline banner, landscape), and add notes to ADR-0001 and ADR-0010; verify by following the README in a fresh clone.
- [x] 6.4 Run the full `pnpm check` and bundle export from a fresh clone, confirm CI is green, and record the evidence including what could not be verified on this machine.

## Evidence

- Local and fresh clone: `pnpm check` exit 0 (design tokens 8 tests, contracts 10, API 138, mobile 78 across 8 suites), including the production bundle export for iOS and Android and the check that the development gallery is absent from both bundles (the same check fails on a development bundle). CI (`check`, `api`, `mobile`, `audit`) green on PR 13.
- A throwaway PR with a deliberate mobile type error failed `check` and `mobile` and showed `mergeStateStatus: BLOCKED` once `mobile` was added to the required checks on `main`; it was closed unmerged.
- Metro serves iOS and Android development bundles (HTTP 200, about 8 MB each) for the real app, both on this machine and in a fresh clone, and the Expo manifest reports the name and scheme. The Expo development server was started for the owner.
- Mutation checks: a deliberate hooks-rule violation is caught by lint; a deliberate type error fails typecheck; a literal color would fail the token-usage test.
- **Not verified (no Xcode or Android SDK on this machine, no physical device used):** physical back button and iOS swipe-back, Dynamic Type and Android font size, VoiceOver and TalkBack, real rendering, the native tab bar (tests simulate a tab press with the same action), and haptics. These are on the manual checklist in `apps/mobile/README.md`; none is claimed as verified.
- Test noise: expo-router logs a "linking configured in multiple places" warning when a test renders the router twice in one file. It is harmless and does not affect results.

## Workflow follow-up

- Review, then archive after verification. Next proposals: `mobile-auth` (real sign-in, registration, secure token storage using the existing API) and `instructor-permission-delegation`.
