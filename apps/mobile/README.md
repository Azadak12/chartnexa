# @chartnexa/mobile

ChartNexa Academy app for iOS and Android: Expo SDK 58, React Native 0.88, React 19, TypeScript, Expo Router. This is the app **shell**: brand tokens, base components, navigation rules and screen states. There is no real sign-in or feature screen yet (`mobile-auth` and the course changes come next).

## What was verified and what was not
- **Verified in automated tests and CI:** component behavior and accessibility properties, navigation and return-to rules, back handling order, remembered list position, API error mapping, offline banner, font fallback, contrast of every approved color pair, production bundles for iOS and Android build under pnpm, and the development gallery is absent from production bundles.
- **Not verified (needs a real device; no Xcode or Android SDK was available when this was built):** the physical Android back button and iOS swipe-back, Dynamic Type and Android font size, VoiceOver and TalkBack, real gestures, haptics, rendering on actual screens, and the native tab bar (tests cannot render it). Use the checklist below.

## Run it
Requirements: Node 26, pnpm (see the repository `CONTRIBUTING.md`).
```bash
pnpm install
pnpm --filter @chartnexa/design-tokens --filter @chartnexa/api-contracts build
cd apps/mobile && pnpm start
```
Scan the QR code with **Expo Go** on a phone on the same Wi-Fi (App Store or Google Play). With Xcode or Android Studio installed, press `i` or `a` to open a simulator or emulator.

The app reads the API address from `EXPO_PUBLIC_API_BASE_URL` (public value only, never put a secret in the app). From an Android emulator use `http://10.0.2.2:3000`; from a phone use your computer's LAN address. Nothing in the shell calls the API yet.

## Structure
```
app/                     Expo Router routes
  (public)/              welcome, sign-in (placeholder)
  (app)/                 signed-in area; guard remembers where you were headed
    (tabs)/              home, courses (own stack), profile
  gallery.tsx            development-only component gallery (absent from production bundles)
  +not-found.tsx         friendly unknown-link screen
src/theme                tokens re-exported from @chartnexa/design-tokens
src/ui                   Text, Button, IconButton, TextField, Banner, Skeleton, Screen, Card, BottomSheet, Dialog, overlay stack
src/navigation           return-to validation, remembered list position and filters
src/session              session store (signed-out until mobile-auth)
src/api                  apiFetch and plain-language error mapping
src/state                StateView (loading, empty, error, offline, unauthorized), QueryStateView, OfflineBanner, query client
src/fonts                Inter loading with system-font fallback
```

## Rules to follow when adding a screen
1. Colors, spacing, radii and type come from `src/theme` (a test fails on literal hex or rgb colors).
2. Use `Screen`, `Text`, `Button` and the other `src/ui` components. Buttons ignore presses while loading; wrap submits in `useSubmitOnce`.
3. Every screen that loads data uses `QueryStateView` or `StateView` so loading, empty, error (with Retry), offline and unauthorized look the same everywhere.
4. Short contextual content goes in `BottomSheet` or `Dialog`; long tasks get a full screen. Do not build your own modals: back-button order depends on the shared overlay stack.
5. For a list, call `useRestorableScroll("<unique key>")` and `useScreenMemoryState("<unique key>", initial)` so position and filters survive opening an item and coming back.
6. Never show server text. Errors go through `apiFetch`, which returns a plain-language message and a support reference.
7. Add a test with the screen.

## Decisions recorded here
- **Styling:** React Native `StyleSheet` with tokens, not NativeWind (fewer build plugins to verify with pnpm and Metro).
- **pnpm and Metro:** the default isolated pnpm layout works with Expo SDK 58; `expo export` produces iOS and Android Hermes bundles with no extra Metro or linker settings. The hoisted-linker fallback was not needed.
- **Icons:** Feather from `@expo/vector-icons` (bundled with Expo), an open line-art set equivalent to the Lucide wording in `docs/04_BRAND_AND_UX.md`.
- **Tab bar:** Expo Router's tab bar is native, so tests simulate a tab press with the same navigation action.
- **Identifiers:** `com.chartnexa.academy` and the name "ChartNexa Academy" are placeholders until the final brand and publisher accounts exist (decision Q12).
- **pnpm build scripts:** `@parcel/watcher` build is denied (an optional native file watcher); Metro and Jest fall back to Node's watcher.

## Manual device checklist (not yet run)
| Check | Android | iOS |
|---|---|---|
| Open a sheet, press back: sheet closes, screen unchanged | hardware/gesture back | swipe down or Close |
| With no sheet open, back returns to the previous screen | yes | edge swipe |
| Deep link `chartnexa://courses/42` while signed out goes to sign-in | yes | yes |
| Largest system text size: nothing clipped, buttons still tappable | Settings > Display > Font size | Settings > Accessibility > Larger Text |
| Screen reader reads buttons, field errors, tab names | TalkBack | VoiceOver |
| Reduced motion: skeletons are still | Remove animations | Reduce Motion |
| Airplane mode shows the offline banner, content stays | yes | yes |
| Landscape layout is usable | yes | yes |
| Tap targets feel at least as large as a thumb | yes | yes |
