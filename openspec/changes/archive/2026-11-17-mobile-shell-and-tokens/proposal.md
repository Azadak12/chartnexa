# Proposal

## Why

The backend can identify users, roles and permissions, but there is no app. Every screen in the product (catalog, player, reviews, staff tools) needs the same foundation: the brand look, navigation that keeps the user's place, and consistent loading, empty, error and offline states. Building that once, and proving the Expo and pnpm combination works, removes the largest remaining stack risk (ADR-0001) before any feature screen exists, and encodes the UX navigation policy (ADR-0010) so features cannot each invent their own.

## What Changes

- Add `apps/mobile`: an Expo (React Native, TypeScript) app for iOS and Android using Expo Router, with a signed-out area and a signed-in tab area (Home, My Courses, Profile) of placeholder screens.
- Extend `packages/design-tokens` into the single source of truth for brand colors (white `#FFFFFF`, black `#111111`, blue `#2563EB`, tint `#EFF6FF`), neutrals, status colors, spacing, radius, type scale and touch-target size, with automated contrast checks.
- Add base components: text, button (primary, secondary, tertiary, disabled, loading), text input with linked error, screen container, card, banner, skeleton, and a bottom sheet.
- Encode the navigation policy: route protection with a validated `returnTo` so login or session expiry returns people to where they were; Android hardware back and iOS gestures dismiss the topmost overlay before navigating; scroll position and filters are restored when returning to a list; unknown deep links land on a friendly not-found screen.
- Add standard screen states (loading, empty, error with retry, offline, unauthorized) and a small API client that turns the API's error envelope into human-readable messages without technical detail, plus duplicate-submit protection.
- Add mobile CI: typecheck, component tests, and a production bundle export for iOS and Android that proves Metro resolves the pnpm workspace.
- Document how to run the app, including a manual device checklist for what cannot be verified here.
- **Not included:** real sign-in, registration and secure token storage (`mobile-auth`), any course, catalog, player, review or staff screen, push notifications, in-app purchase or payments, offline media, store listing, and native release builds.

Assumptions (proposed, changeable before apply):
- Styling uses React Native `StyleSheet` driven by the tokens package, not NativeWind. Fewer moving parts and no extra build plugin with pnpm; ADR-0001 left this choice to a compatibility check, which this change performs and records.
- Expo Go and the Expo development server are enough for this change (no custom native modules yet); EAS development builds start with billing or other native modules.
- Placeholder app identifiers (`com.chartnexa.academy`) and name "ChartNexa Academy" are temporary until Q12 (final brand and publisher accounts) is settled.
- The signed-out area shows a welcome screen and a sign-in placeholder; the session provider always reports signed-out in the real app until `mobile-auth`. Tests inject a signed-in session to prove the return-to behavior.
- Inter is bundled with `@expo-google-fonts/inter` (OFL licensed, to be re-confirmed in the licensing review) with a system fallback.
- The API address comes from `EXPO_PUBLIC_API_BASE_URL`; nothing secret is placed in the app.

**Environment limits found while planning:** this machine has Xcode command-line tools only and no Android SDK, so neither simulator nor emulator can run the app here. Automated component tests and a production bundle export are verified in CI and locally; behavior that needs a real device (hardware back button, iOS swipe-back, Dynamic Type, VoiceOver and TalkBack) is listed as a manual checklist for the owner and is not claimed as verified.

## Capabilities

### New Capabilities
- `app-navigation`: route structure, route protection with safe return-to, back behavior, preserved list position, deep-link fallback.
- `design-system`: brand tokens, accessibility rules, typography, base components and their states.
- `screen-states`: loading, empty, error, offline and unauthorized presentation, human-readable API errors, duplicate-submit protection.

### Modified Capabilities
<!-- None. -->

## Impact

- New: `apps/mobile`, expanded `packages/design-tokens`, mobile CI job, `.env.example` entry (public API base URL only), docs.
- New dependencies (verify versions, licenses and Expo SDK compatibility at apply with `expo install`): expo, expo-router, react-native, react, react-native-screens, react-native-safe-area-context, expo-font and Inter, expo-status-bar, expo-splash-screen, `@react-native-community/netinfo`, `@tanstack/react-query`, and dev tools jest-expo, React Native Testing Library, react-hooks lint rules.
- No backend changes. No secrets. No payment code.
- Out of scope: real authentication, feature screens, release builds, store compliance.
