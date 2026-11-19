# UI/UX corrections after Android testing

Automated checks pass locally. **Nothing here has been verified on a physical Android phone**; use the checklist at the end.

## Fixed
| Problem | Root cause | Fix |
| --- | --- | --- |
| Explore filters filled the screen | Every level and category was a full-size chip rendered in the list header | One **Filters** button next to search opens a bottom sheet (radio groups: Difficulty, Category; Reset Filters, Apply Filters). Applied filters show as small removable chips; a result count sits under them. The list starts right below. |
| Course price clipped, rating overlapped price | Rating and price shared one row with no wrapping; the title column had no `minWidth: 0` | New `CourseCard`: flexible text column (`flex: 1`, `minWidth: 0`), two-line titles, level and rating wrap, and the **price has its own row**. Thumbnail width follows the screen (84/96/108dp). |
| Home chart filled the screen | The full Lab chart with timeframe, zoom and level controls was reused | New compact `MarketPreviewCard`: navy panel, 12 simulated candles, one line of text, one **Explore Learning Lab** button. Timeframes, zoom, levels and OHLC detail stay in the Lab. |
| Home order | Chart first, then Continue Learning | Chart, Continue Learning, Featured, Trading Categories, next live class. |
| Confusing back behaviour | Course and lesson screens had only a bottom "Back" button; Android Back from a tab always went to the first tab | Back arrows on Course Details, lessons and Demo Accounts. Tabs use history back behaviour. Deep links fall back to the parent (Explore / the course). |
| Role testing was cumbersome | No in-app way to move between roles | Development-only Demo Accounts hub (below). |

## Explore, before and after
Before: title, search, a wrapped block of difficulty chips, a wrapped block of category chips, then courses. After: "Explore Courses", [search] [Filters], "N courses" plus removable chips, then courses. Search and filters combine; opening a course and coming back keeps both (and scroll position).

## Home, before and after
Before: a tall chart card with timeframe buttons, zoom buttons, toggles, a paragraph and a readout. After: about 200dp. The candles appear one after another once when Home first has focus; the timer stops when the screen loses focus and when the sequence ends; with reduced motion they appear at once. Tap a candle to read it ("▲ Bullish: opened 101.20, closed 103.40").

## CourseCard details
- Fixed widths: only the thumbnail, as a fraction of the screen. The text column never has a fixed width.
- Title: up to two lines. Category, instructor and level: one line each. Rating: one star, average and count, or "No reviews yet". Price: its own row, never shrunk. Whole card is one button at least 96dp tall, labelled with every detail.
- Text uses the app's `Text`, which scales with system font size and sets no fixed heights.
- Tested at 320, 360, 393 and 430dp with a very long title (`__tests__/course-card.test.tsx`). These tests check the layout rules, not rendered pixels.

## Student journey (run against a real API and database, test mode)
`Explore, Course Details, Watch Preview, Purchase, My Learning, lessons, review`:
- Preview lesson: 200; preview video: 200 and ranged stream 206; a paid lesson before purchase: 403.
- Review before purchase: 403 (viewing a preview does not allow reviews).
- Create order with an idempotency key: pending, test mode; repeating the key returns the same order.
- Complete the test payment: paid. Course Details shows enrolled; the paid lesson is now 200; the course appears in My Learning (0 of 6).
- Lesson completion: a video lesson answers 409 ("Watch the video to complete this lesson"); a text lesson completes (1 of 6).
- Review after purchase: create 200, edit 200, rating average updates, delete 200.
This used the demo database, so the demo Student now also owns "Risk Management & Trading Psychology" and "Options Trading Fundamentals". Re-run `seed:demo` on a fresh database to reset.
In the app: before enrolling the button reads **Purchase Course · $price**; the checkout says "Demo mode … No real money is charged"; after payment **Go to the course** and **Open My Learning**. After enrolling the course page shows Continue and progress, with no purchase button or success banner.

## Navigation
Student tabs: Home, Explore, Learn, Tasks, Profile. Instructor: Dashboard, Courses, Assignments, Profile. Manager: Dashboard, Invitations, Profile. Admin: Dashboard, Users, Courses, More. Admin's **More** is the account screen (Demo accounts in development, Change password, Sessions, Sign out). The responsive tab bar is unchanged.

## Demo Accounts hub (development only)
- Enable: `EXPO_PUBLIC_DEMO_ACCOUNTS=true` when starting Expo (`EXPO_PUBLIC_DEMO_ACCOUNTS=true EXPO_PUBLIC_API_BASE_URL=http://YOUR-IP:3000 pnpm --filter @chartnexa/mobile start`). The `development` and `preview` EAS profiles set it; `production` does not, and production builds ignore it.
- Open it from **Sign In > Try a demo account**, or **Profile / More > Demo accounts** when signed in.
- Four cards (Student, Instructor, Manager, Admin) show the public email, what the role does, and a note that Manager and Admin need two-step sign-in. **Sign in as …** opens the normal sign-in with the email filled in. If you are already signed in it signs out first (the normal sign-out).
- No password, token, MFA secret or recovery code is in the app. Passwords come from `pnpm --filter @chartnexa/api demo:credentials`; Manager and Admin still need the authenticator code (or `dev:totp`). Only the four demo emails can be prefilled.

## Role checklist (manual, on the phone)
- **Student:** search + Filters; open a course; Watch Preview; back, back; purchase in test mode; see it under Learn; open a lesson, Next/Previous; leave a review; Tasks; Profile.
- **Instructor:** Dashboard counts; Courses (create/edit, modules, lessons, thumbnail, video, PDF); Assignments hub, create, review submissions.
- **Manager:** MFA sign-in; Dashboard; Invitations (invite, status); no Courses/Users/audit.
- **Admin:** MFA sign-in; Dashboard; Users (invitations and instructors, deactivate); Courses; More (account, sign out).

## Still needs a physical Android phone
Tab bar and cards on real widths and large font sizes; chart animation smoothness; the filter sheet with the keyboard; hardware Back; video playback; MFA on a real authenticator; installable build (needs a valid Expo token).

## Authentication-first navigation
The app opens on **Sign In** (there is no Welcome page). Signed out: every protected link goes to Sign In and remembers where it was headed; Sign In and Sign Up link to each other at the bottom ("Don't have an account? Sign up", "Already have an account? Sign in"); neither shows the tab bar. Password reset, email verification, two-step and instructor-invitation screens stay reachable. Signed in: Student to Home; Instructor, Manager and Admin to Dashboard, after a plain loading view while the role is read (Sign In is never shown to a valid session). One guard in the root layout (`src/navigation/AuthGate.tsx`) enforces this; on sign-out or expiry the protected screens are replaced, so Android Back cannot return to them. The Test server control and the dev-only Demo accounts card moved to the bottom of Sign In.
