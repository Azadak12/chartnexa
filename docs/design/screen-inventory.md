# Screen and feature parity inventory (2026-11-21)

Legend: **Dark theme** = new palette via shared tokens (all screens). **Redesigned** = layout/interaction reworked. **Pending** = still the earlier layout in the new palette; not yet redesigned.

| Area | Routes / screens | Status |
|---|---|---|
| Student Home | `home` | Redesigned: Market City entrance (provisional art), progress card, categories |
| Student discovery | `explore`, `course/[id]` | Redesigned: cards, hero, ring (no photoreal covers yet) |
| Student learning | `courses`, lesson reader, completion | Redesigned: winding path, bite steps, celebration |
| Lab | `lab` | Redesigned header ("Market Observatory", simulated-data pill); chart and quiz internals unchanged. Interior artwork pending |
| Assignments | `assignments`, `assignment/[id]` | List redesigned: mission cards (status rail, labelled pill). Detail and submit screens: dark theme only |
| Live classes | section in course page, `NextLiveCard` | Redesigned row: date block, live pulse (Reduced-Motion safe). Auditorium artwork pending |
| Profile/account | `profile/*` (purchases, sessions, two-step, change-password, announcements) | Dark theme only |
| Checkout | `checkout/[orderId]` | Dark theme only |
| Auth | sign-in, register, forgot/reset, verify, two-step, recovery codes, invitations | Dark theme only |
| Instructor | `dashboard`, `staff-courses`, `staff-assignments`, `manage/*` (courses, lessons, assignments, live, students, categories) | Dark theme only. Pending studio redesign |
| Manager | `dashboard`, `invitations`, reviews, staff-announcements, orders | Dark theme only. Pending operations-center redesign |
| Admin | `dashboard`, `users`, `more`, permissions, instructors, audit, orders | Dark theme only. Pending command-center redesign |
| Navigation | tab bar (all roles) | Animated icon; safe-area and 56pt targets kept |
| Foundation | tokens, `layout/responsive.ts` (gutters, tablet width cap), `motion/motion.ts` (durations, ambient loop that pauses in background and with Reduced Motion) | Done; `Screen` now centres and caps content on tablets |

Shared across roles: `raised` card surface (`theme/surfaces.ts`) now used by `Card`, admin `StatTile`, `DashboardMetricCard`, mission and live cards; `StatusPill` is the single status shape; `StudioHeader` gradient fixed for the dark palette. Staff dashboards already used `StudioHeader`/`StatTile`, so they inherit this; their list/form screens (manage/*, staff assignments, reviews, users) were not individually reworked.

Staff pass (2026-11-21): every staff screen with a fixed title now opens with `StaffPageHeader` (area label, icon, header title): course/lesson/assignment/live forms and lists, students, grant access, categories, reviews, announcements, invitations, permissions directory, instructor search, orders, audit log. Staff list cards use the shared `raised` surface. Not changed: screens whose title is the record name (instructor/permission person, assignment manage), and the form field layouts themselves.

Behaviour, API calls, roles and routes were not changed.
