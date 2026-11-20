# Screen and feature parity inventory (2026-11-21)

Legend: **Dark theme** = new palette via shared tokens (all screens). **Redesigned** = layout/interaction reworked. **Pending** = still the earlier layout in the new palette; not yet redesigned.

| Area | Routes / screens | Status |
|---|---|---|
| Student Home | `home` | Redesigned: Market City entrance (provisional art), progress card, categories |
| Student discovery | `explore`, `course/[id]` | Redesigned: cards, hero, ring (no photoreal covers yet) |
| Student learning | `courses`, lesson reader, completion | Redesigned: winding path, bite steps, celebration |
| Lab | `lab` | Dark theme only. Pending Observatory redesign |
| Assignments | `assignments`, `assignment/[id]` | Dark theme only. Pending Mission Center |
| Live classes | section in course page, `NextLiveCard` | Dark theme only. Pending auditorium |
| Profile/account | `profile/*` (purchases, sessions, two-step, change-password, announcements) | Dark theme only |
| Checkout | `checkout/[orderId]` | Dark theme only |
| Auth | sign-in, register, forgot/reset, verify, two-step, recovery codes, invitations | Dark theme only |
| Instructor | `dashboard`, `staff-courses`, `staff-assignments`, `manage/*` (courses, lessons, assignments, live, students, categories) | Dark theme only. Pending studio redesign |
| Manager | `dashboard`, `invitations`, reviews, staff-announcements, orders | Dark theme only. Pending operations-center redesign |
| Admin | `dashboard`, `users`, `more`, permissions, instructors, audit, orders | Dark theme only. Pending command-center redesign |
| Navigation | tab bar (all roles) | Animated icon; safe-area and 56pt targets kept |
| Foundation | tokens, `layout/responsive.ts` (gutters, tablet width cap), `motion/motion.ts` (durations, ambient loop that pauses in background and with Reduced Motion) | Done; `Screen` now centres and caps content on tablets |

Behaviour, API calls, roles and routes were not changed.
