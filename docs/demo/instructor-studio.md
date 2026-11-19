# Instructor Studio and Manage Courses redesign

Status: implemented and covered by automated tests; **not verified on a physical Android phone**. The screenshots and screen recording mentioned in the brief were not attached, so the work follows the written description.

## Instructor Studio (Instructor and Lecturer)
Both accounts use the same screen; what each sees comes from its own permissions (the Instructor's five courses, the Lecturer's two).
- **Header:** navy-to-blue surface: "CHARTNEXA ACADEMY", "Welcome back, <first name>" (only when the account has a name), "Instructor Studio", "Manage your courses and teaching content." A decorative chart mark (invented candles, no prices or percentages) is hidden from screen readers and dropped on narrow screens or large text.
- **Your courses at a glance:** Published courses (emerald) and Draft courses (amber), real counts that count up briefly when they first arrive and after a refresh. Tapping opens Manage Courses already filtered (`/manage?status=published` or `draft`). Zero is shown as 0.
- **Quick actions:** New course (needs permission) and Manage courses.
- **Your courses:** up to three of the most recently updated courses with thumbnail, status, level and price, an empty state ("No courses yet", with New course when allowed), skeleton cards while loading and an error state with Try again. "See all" opens the full list. These use the same two requests as the counts (published and drafts), so the previews add no network call.
- **Teaching tools:** any other entries the role has (for example Students and access), unchanged.
- Pull down to refresh.

## Manage Courses (the shared staff course list)
This is one screen used by Instructor, Lecturer, Manager and Admin, so all of them get the new look; their permissions and data are unchanged.
- **Header:** "Manage Courses", "Create, edit and publish the courses you teach.", New course and Categories (each only with its permission).
- **Filters:** All / Drafts / Published as a segmented control with a sliding selected pill. Filtering is immediate; the previous list stays visible (dimmed) while the next one loads, so nothing flashes and the scroll position is kept.
- **Cards:** thumbnail (or the course's colour tile), status pill (Published in emerald with a check, Draft in amber with a pencil, always with the word), title up to three lines, level, price on its own row that never shrinks. Soft shadow, eases down when pressed, one tap opens the course to edit.
- Skeleton cards while loading, friendly empty states per filter, an error state with Retry. 32dp of bottom space so the last card clears the tab bar.

## Animations (all brief, none looping)
Entrance: header, statistics, quick actions and course previews fade and rise in a short stagger (260ms, 70ms apart, native driver). Numbers count up for 450ms. The filter pill slides for 180ms (native driver). Cards ease to 98 percent while pressed. With reduced motion everything appears at once and nothing moves.

## Not changed
Assignments and Profile screens, the other role dashboards, permissions, navigation destinations, the tab bar.

## To check on the phone
Header and counts, tapping a count, the previews, the segmented filter, long course names and prices at your font size, pull to refresh, and that the last card clears the tab bar. Sign in as both Instructor and Lecturer.
