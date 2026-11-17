# Design

## Context

Monorepo exists (pnpm workspaces, Turborepo, Node 26, strict TypeScript, ESLint, Prettier, Vitest, CI jobs `check`, `api`, `audit` required on `main`). `packages/design-tokens` currently exports only the four brand colors; `packages/api-contracts` exports the error envelope and auth schemas as Zod; `apps/` holds only `api`. Accepted ADR-0001 (Expo, TypeScript, Expo Router, TanStack Query, React Hook Form with Zod; styling left to a compatibility check) and ADR-0010 (navigation policy). Brand rules are in `docs/04_BRAND_AND_UX.md` (white, black, blue, tint, 4px spacing, 12px controls, 16px cards, 44pt targets, Inter, Lucide-style line icons, no dark app, no fake urgency). Observed at planning time: Expo SDK 58, React Native 0.88, React 19.3 are current and Node 26 is supported; this machine has no Xcode and no Android SDK, so no simulator or emulator can run the app here. See proposal.md for scope.

## Goals / Non-Goals

**Goals:** a bootable, tested app shell; tokens as the only source of visual constants; navigation, back and state behavior implemented once and covered by tests; a proven Expo + pnpm + Metro setup in CI.
**Non-Goals:** real authentication, feature screens, secure storage, native release builds, store assets, web target, dark theme, localization beyond layout readiness.

## Decisions

1. **Expo SDK pinned at apply time** using `expo install` so every Expo-related package gets its matching version; verify licenses and peer needs, and keep pnpm's release-age protection (pin an older version rather than excluding packages). Build the smallest app first and run `expo export` for iOS and Android before writing anything else: this is the spike that proves pnpm's isolated layout works with Metro. If it fails, the documented fallback is a hoisted node linker for the workspace, recorded as an ADR-0001 update.
2. **Routing with Expo Router** (file based). Structure: `app/_layout.tsx` (providers, fonts, splash), `(public)` group (welcome, sign-in placeholder), `(app)` group guarded by the session with `(tabs)` for Home, My Courses and Profile, `courses/[id]` as a placeholder detail screen (exercises params, back and remembered position), `+not-found`, and a dev-only gallery route that is excluded from production bundles by checking `__DEV__`. Tabs stay mounted so each tab keeps its stack.
3. **Session boundary:** a `SessionProvider` exposes `{ status, expire() }`. In the app it is always signed-out until `mobile-auth` supplies tokens; tests inject a signed-in provider. The guard redirects to `/sign-in?returnTo=<encoded path and query>`. Session expiry and API 401 both call `expire()`, which routes the same way.
4. **Safe `returnTo`:** `sanitizeReturnTo(value)` accepts only a string up to 512 characters that begins with a single `/`, contains no scheme, backslash, `..` segment, control character or second leading slash, matches a conservative path-and-query pattern, and does not point back at the public area; anything else yields Home. Allow-list by pattern rather than parsing URLs.
5. **Back handling:** an `OverlayProvider` keeps a stack of open overlays. A single `BackHandler` listener (Android hardware back) closes the top overlay and reports the event handled, otherwise lets the router go back. `BottomSheet` and a small `Dialog` are built on React Native `Modal` with `onRequestClose` wired to the same dismissal, which also covers the iOS dismissal gesture; when an overlay closes, accessibility focus returns to the control that opened it.
6. **Remembered list position and filters:** a small in-memory `ScreenMemory` keyed by screen id with hooks for scroll offset and filter state; entries are cleared on sign-out and never written to disk. Each list passes its own key, so lists do not leak state into each other. (Alternative: Zustand store; deferred until a second use case justifies the dependency.)
7. **Tokens** live in `packages/design-tokens` as plain TypeScript (colors, neutrals, status, spacing in 4px steps, radii 12 and 16, type scale, minimum touch size 44, maximum font scale 2, motion durations). A pure `contrastRatio()` function and a list of every approved foreground/background pairing are verified by Vitest at 4.5:1 for normal text and 3:1 for large text and control borders. Status colors (error, success, warning) are chosen to pass on white and always accompany an icon or label. Disabled controls are exempt from contrast per WCAG but stay legible and are labeled disabled for assistive technology.
8. **Components** in `apps/mobile/src/ui`: `Text` (variants, `maxFontSizeMultiplier` 2, no fixed heights), `Screen`, `Card`, `Button` (primary, secondary, tertiary, disabled, loading; ignores presses unless idle), `IconButton` (requires an accessibility label, enforced by type and a development-time check; hit slop brings the target to 44), `TextField` (label, error text linked through accessibility, never color alone), `Banner` (icon plus text), `Skeleton` (static when reduced motion is on), `BottomSheet`, `Dialog`, and `StateView`. Icons come from `@expo/vector-icons` Feather (line art, bundled with Expo, no extra native module); this replaces the brand doc's Lucide wording with the equivalent open line set and avoids a second icon dependency.
9. **Typography:** Inter through `@expo-google-fonts/inter` loaded at startup with the splash screen held until fonts load or a short timeout elapses, then the system font is used (spec: usable without Inter). License terms (OFL) are re-confirmed in the licensing review, which `docs/04` already marks as pending.
10. **Styling:** `StyleSheet` with token values, no NativeWind. Reasons: no Babel or Tailwind plugin to verify with pnpm and Metro, simpler to test, and the component set is small. Recorded as the ADR-0001 follow-up.
11. **API client:** `apiFetch` builds the URL from `EXPO_PUBLIC_API_BASE_URL`, sends JSON, adds a client-generated correlation id header (the server accepts well-formed ids, so even failed requests have a support reference), enforces a 15-second timeout, and parses error bodies with `errorEnvelopeSchema` from `@chartnexa/api-contracts`. It returns or throws an `AppError` with kind `network`, `validation`, `unauthorized`, `rate_limited`, `server` or `unknown`, a plain-language message chosen by error code, optional field errors and the request id. Response text is never shown. It takes a token supplier callback so `mobile-auth` can plug in later.
12. **Screen states:** `StateView` renders loading, empty, error (with Retry), offline and unauthorized from shared copy; `QueryStateView` adapts a TanStack Query result to those states. TanStack Query is configured with no automatic retry on 4xx and its online manager wired to NetInfo. `OfflineBanner` appears from NetInfo and leaves content mounted. `useSubmitOnce` wraps an async action and ignores re-entry while it runs.
13. **Testing:** `jest-expo` with React Native Testing Library and `expo-router/testing-library` for navigation tests (deep link while signed out returns after sign-in, unsafe `returnTo`, tabs keep state, not-found, list memory), a mocked `BackHandler` for overlay order, mocked `AccessibilityInfo` for reduced motion and focus, a mocked NetInfo, and mocked `fetch` for the API client. Vitest covers tokens and contrast. Layout at large text is checked by asserting components use scalable text and no fixed text heights; true Dynamic Type rendering is on the manual device checklist.
14. **CI:** a new `mobile` job installs with the frozen lockfile, runs mobile typecheck and tests, and runs `expo export` for iOS and Android with telemetry off. It becomes a required check on `main` only after it has passed once. `pnpm check` runs the same mobile steps through Turborepo. Lint gains the React hooks rules.
15. **Config:** `app.config.ts` with name "ChartNexa Academy", slug `chartnexa`, scheme `chartnexa`, light UI only, placeholder bundle identifier and package `com.chartnexa.academy` (to be replaced after Q12), portrait plus landscape allowed (video later), and no secrets. The only environment value is the public API base URL.

## Risks / Trade-offs

- pnpm's isolated layout may not work with Metro -> the first task is the bundle export spike with the hoisted-linker fallback documented.
- No simulator or emulator here, so gestures, hardware back, Dynamic Type and screen readers are not verified -> automated tests cover the logic and a manual device checklist is delivered for the owner; the change records what was and was not verified.
- Expo SDK upgrades are frequent -> versions are pinned through `expo install` and the SDK is recorded in the README.
- Accessibility tests with a JavaScript renderer approximate, not replace, VoiceOver and TalkBack -> manual checklist.
- Inter bundle adds app size -> only the weights used (regular, medium, semibold, bold) are loaded.
- Dev-only gallery could leak into production -> guarded by `__DEV__` and verified absent from the exported production bundle.
- StyleSheet theming has less tooling than utility CSS -> the component set is small and tokens are centralized; revisit if the app grows.

## Migration Plan

New app and package changes only; no data or backend changes. Rollback removes `apps/mobile` and the CI job; the expanded tokens package is additive. The `mobile` required check is added to `main` protection only after it has passed once.

## Open Questions

- Final app name, bundle identifier and publisher accounts (Q12), needed before any store build.
- Whether landscape layouts beyond video need design work, decided with the player change.

## Implementation notes (added during apply)

- Expo Router's tab bar is native and not rendered by the test renderer, so tab presses are simulated with the same `JUMP_TO` navigation action; the tab bar itself is on the manual device checklist.
- On session expiry the router state is already unwinding, so the guard remembers the last location seen while signed in and uses it as the `returnTo`; a signed-out deep link uses the current location. A first attempt using `useUnstableGlobalHref` returned a wrong location mid-expiry and was replaced.
- The development gallery is bundled only when `__DEV__` is true; `scripts/verify-bundle.mjs` (part of `build`) fails if its marker appears in a production bundle, and was shown to fail on a development bundle.
- `@parcel/watcher` (optional native file watcher) is explicitly denied as a build script; Metro and Jest use Node's watcher.
- `react-test-renderer` 19, React Native Testing Library 14 (its API is asynchronous) and `jest-expo` 58 are used; NetInfo and the splash screen are mocked in `jest.setup.js`.
