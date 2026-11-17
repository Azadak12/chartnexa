# ADR-0003: Staff web workspace

- **Status:** Deferred. Owner decision C12 (2026-11-17): all roles use the mobile app; no staff web for now.
- **Date:** 2026-11-17
- **Related:** P03, Q01

## Context
Instructor/Manager/Admin work includes bulk authoring, large uploads and data tables, which are poor on a phone. Whether staff use mobile, web, or both is unconfirmed.

## Decision
Keep the API client-agnostic (OpenAPI, generated clients, one error envelope, cursor pagination). Proposed: Next.js + TypeScript staff web, built in the `staff-authoring-surface` change, with mobile for students. Reversible until Q01 is answered.

## Alternatives considered
- Expo web for everything: less duplication, weaker admin UX.
- Staff mobile-only: lowest cost, poor authoring experience.

## Consequences
An extra deliverable and deployment if approved. Shared types and tokens live in `packages/`.

## Update 2026-11-17
C12 answers Q01: staff roles use mobile. The Next.js workspace is not built now. Keep the API client-agnostic so a web client can be added later without backend changes. Risk N05: large video uploads and bulk authoring from phones need explicit design (resumable background upload, Wi-Fi-only option, minimal bulk tools) in `staff-authoring-surface`.
