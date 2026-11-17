# ADR-0010: UX navigation policy

- **Status:** Accepted (owner, 2026-11-17)
- **Date:** 2026-11-17
- **Related:** doc 03 (Mandatory UX navigation behavior), doc 04

## Context
Mobile-first, context-preserving UX for four roles, with accessibility requirements.

## Decision
| Situation | Pattern |
|---|---|
| Review write/edit, quick filters, confirmations, short previews | Bottom sheet or dialog |
| Course detail, player, register, checkout, long editors | Full screen |
| Staff on tablet/web | Side panel or drawer |
| Login/checkout interruption | Store `returnTo` (route, params, course id); restore scroll and filters afterward |
| Back (Android hardware, iOS swipe) | Dismiss topmost overlay first, then return to prior context |
| Lists | Preserve scroll, active filters and selection |
| Forms | Draft autosave, unsaved-change guard, submit lock plus idempotency key |
| Network | Skeletons, offline banner, retry with backoff, last-good cache where safe |
| Every screen | Defined loading, empty, partial, offline, error, validation, unauthorized and success states |
| Accessibility | 44pt targets, text scaling, VoiceOver/TalkBack labels, field-linked errors, focus returns to trigger when a sheet closes, reduced motion, no status by colour alone |
| Integrity | No fake timers, fake scarcity or fabricated ratings (doc 04) |

## Alternatives considered
Popups for everything (breaks long tasks); full screens for everything (breaks context).

## Consequences
Navigation shell change (`mobile-shell-and-tokens`) must implement and test back-stack and returnTo behavior first.
