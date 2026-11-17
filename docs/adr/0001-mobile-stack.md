# ADR-0001: Mobile stack

- **Status:** Accepted (owner, 2026-11-17)
- **Date:** 2026-11-17
- **Related:** C03, P01, Q01

## Context
Student app must run on iOS and Android with a native feel, video playback, and (later) store billing.

## Decision
React Native + Expo + TypeScript, Expo Router, TanStack Query for server state, React Hook Form + Zod. Use EAS development builds, not Expo Go, because billing and some media libraries are native modules. Styling library (NativeWind vs StyleSheet with tokens) to be chosen after a build test.

## Alternatives considered
- Flutter: comparable quality, but no shared TypeScript with the API.
- Native Swift + Kotlin: best platform fit, roughly double the cost.
- PWA/Capacitor: weak video, billing and store fit.

## Consequences
One TypeScript codebase across mobile, API contracts and optional staff web. Native modules require build pipelines from the start. Expo SDK upgrade cadence must be tracked.

## Implementation note 2026-11-17 (`mobile-shell-and-tokens`)
Expo SDK 58 (React Native 0.88, React 19, Expo Router) works with the pnpm isolated layout and Node 26: `expo export` builds iOS and Android Hermes bundles with no extra Metro or linker settings, so the hoisted-linker fallback is not needed. Styling decision: React Native `StyleSheet` driven by the shared tokens, not NativeWind. Expo Go is enough until a native module (store billing) is added; EAS development builds start then. No simulator or emulator was available on the build machine, so device behavior is covered by a manual checklist in `apps/mobile/README.md`, not by claims.
