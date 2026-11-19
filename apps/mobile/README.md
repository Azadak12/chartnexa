# @chartnexa/mobile

ChartNexa Academy app for iOS and Android: Expo SDK 58, React Native 0.88, React 19, TypeScript, Expo Router. Includes the app **shell** (brand tokens, base components, navigation rules, screen states) and **account access**: sign in, create account, verify email, forgot and reset password, and a Profile area (name, password, sessions, sign out, delete account). Courses: a catalog on Home (search, level filter, remembered position), a course page, and staff screens to create, edit, publish and unpublish courses (Profile, then Manage courses, for Admins and Managers). Lessons: the course page lists the lesson outline, free-preview lessons open in a reader, and staff add, edit, reorder (up and down buttons) and delete text lessons from Manage courses, then a course, then Lessons. My Courses lists the courses you have access to; the course page says "You are enrolled" and opens every lesson for owners; Admins and Managers grant or revoke access by email from Manage courses, then a course, then Students (decision R17). The lesson reader shows a lesson one paragraph at a time (Back, Next, "Step N of M") with "Show all text" for the whole page; staff are told to leave a blank line between paragraphs. Owners can mark lessons complete, see "N of M lessons complete" on My Courses and the course page, and press Continue to open the next lesson. Admins and Managers sign in with a second step: after the password the app asks for a 6-digit authenticator code (or a recovery code); the first time it walks them through adding an authenticator and shows 10 recovery codes once. Profile shows "Two-step sign-in: On" and lets staff get new recovery codes. Catalog cards and the course page show "4.5 · 12 reviews" (stars are decoration; the words carry the meaning); the course page lists reviews and owners can write, edit and delete their own Other people's reviews have a Report button (reason list, optional details). A hidden review shows its author a text banner with the reason and note and an Appeal button. Admins and Managers get Profile, then Review moderation: Reported, Hidden and Appeals tabs, a detail screen, and sheets to hide, restore and decide. Lessons can have files: staff add PDFs, images, Word documents and text files on the lesson form (with upload progress, cancel and retry), choose whether students may download each one, and replace or delete them; students open files from the lesson reader through short-lived links. Lessons can have a video: students watch with the phone's own controls (play, pause, seek, fullscreen), choose 1x to 2x speed, continue where they stopped, and the lesson completes at 90 percent watched; staff add, replace and remove the MP4 on the lesson form. Video uses a test adapter for now (no adaptive streaming). No live classes, files or buying yet.

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
| Catalog: scroll, open a course, go back: same scroll position, search and level | yes | yes |
| Staff form: numeric keypad for price, multiline description is usable, keyboard does not hide the fields | yes | yes |
| Large text: course cards, price and status labels do not clip | yes | yes |
| Instructor permissions: the Add permission sheet scrolls with the keyboard open, the reason field stays visible, dimmed items are announced as unavailable | yes | yes |
| Screen reader announces "Permission added" / "Permission removed" and focus returns to the button that opened the sheet | TalkBack | VoiceOver |
| Lessons: course page outline shows "Free preview" and "Locked" as text; opening a preview and going back keeps the scroll position | yes | yes |
| Lessons: screen reader reads "Lesson 2: title, locked", the locked-lesson sheet, and announces "moved to 3 of 8" after Move up or down; focus returns to the opener when the sheet or delete dialog closes | TalkBack | VoiceOver |
| Lessons form: the long text field scrolls with the keyboard open, the free-preview switch is announced as on or off, largest text does not clip titles or the move and delete buttons | yes | yes |
| My Courses: scroll, open a course, go back: same scroll position; "Not currently on sale" is read out for an unpublished course | yes | yes |
| Enrolled course page: "You are enrolled" and "Included" lesson labels are read by the screen reader; tapping a lesson opens it with no locked sheet | TalkBack | VoiceOver |
| Staff Students: Grant access form scrolls with the keyboard open, Revoke sheet keeps the reason field visible, "Access granted" and "Access revoked" are announced | TalkBack | VoiceOver |
| Lesson reader: Next and Back move one paragraph, the screen reader says "Step 2 of 6" and lands on the text, the last step offers Back to course | TalkBack | VoiceOver |
| Lesson reader: Show all text and Show in steps work, and the choice stays for the next lesson; largest text scrolls without hiding the buttons; Reduce Motion removes the fade | yes | yes |
| Lesson reader: leave and reopen a lesson, the same step is shown; after closing the app it starts at step 1 | yes | yes |
| Lesson progress: Mark as complete announces "Lesson marked complete", the button name changes, "✓ Completed" is read, and the progress bars read "3 of 8 lessons complete" | TalkBack | VoiceOver |
| Lesson progress: Continue opens the next lesson, Review course appears when all are complete, and My Courses and the course page show the new count after going back | yes | yes |
| Lesson progress: with the largest text size the count, the bar and the Mark button do not clip, and a flaky connection shows the retry message without losing the state | yes | yes |
| Two-step sign-in: the code field opens the numeric keypad, autofills a code from the authenticator on iOS and Android, and the screen reader reads the label and "Six digits" | TalkBack | VoiceOver |
| Two-step setup: "Open authenticator app" opens a real authenticator with the account added, the key can be typed in by hand if none opens, and a wrong first code is explained without losing the screen | yes | yes |
| Recovery codes: shown once, the checkbox is required, Share hands them to a notes or password app, hardware Back asks before leaving, and swipe-back is off on this screen | yes | yes (swipe) |
| Two-step sign-in with the largest text size and Reduce Motion: nothing clips, errors are announced, focus returns to the code field after a wrong code | yes | yes |
| Reviews: the five star buttons are read as "1 star" to "5 stars" with the chosen one announced as selected, "Review saved" is announced, and focus returns to the Write a review button when the sheet closes | TalkBack | VoiceOver |
| Review moderation: the reason options are read as radio buttons with the chosen one selected, "Report sent" and "Review hidden" are announced, and focus returns to the button that opened each sheet | TalkBack | VoiceOver |
| Review moderation: the hidden banner, the reason list and the staff tabs stay readable at the largest text size and show state in words, not color | yes | yes |
| Lesson video: the native controls work, fullscreen rotates to landscape and back, playback resumes at the saved time after closing and reopening the app, 2x speed is announced as selected, and "Lesson complete" is announced at 90 percent | yes | yes |
| Lesson files: picking a file opens the system picker, a 40 MB PDF uploads with the percent shown and can be cancelled, a PDF and an image open in the in-app browser, and Download saves only files staff allowed | yes | yes |
| Reviews: the sheet scrolls with the keyboard open, the character count stays visible, the largest text size does not clip the stars or Save, and Show more reviews keeps the scroll position | yes | yes |
| Sign in, kill the app from the task switcher, reopen: still signed in, no sign-in flash | yes | yes |
| Sign in, delete the app, reinstall: asked to sign in (iOS Keychain can keep an old token, which the server rejects) | yes | yes |
| Airplane mode: sign out works and says the server will be told later; sign in shows the offline message | yes | yes |
| Two devices: end a session from device A, device B signs out at its next action with a clear message | yes | yes |
| Password manager offers to fill and save on sign in and create account | yes | yes |
| Show or hide password works with the screen reader announcing the new state | TalkBack | VoiceOver |
| Open the emailed link: opens the app on Verify email or Reset password with the code filled in | yes | yes |

## Try sign-in on your phone (against the API on your computer)
1. Start PostgreSQL, then the API (from the repository root). Use your computer's address for `APP_LINK_BASE` so emailed links open in Expo Go:
```bash
createdb chartnexa_dev
export DATABASE_URL="postgresql://$USER@localhost:5432/chartnexa_dev"
export CURSOR_SECRET=$(openssl rand -hex 32) ACCESS_TOKEN_SECRET=$(openssl rand -hex 32)
export MAILER_DRIVER=dev APP_LINK_BASE="exp://<your-computer-lan-ip>:8081/--/"
pnpm --filter @chartnexa/api migrate:deploy
pnpm --filter @chartnexa/api dev
```
2. Start the app with the API address for a phone (your computer's LAN address, not `localhost`):
```bash
cd apps/mobile
EXPO_PUBLIC_API_BASE_URL="http://<your-computer-lan-ip>:3000" pnpm start
```
3. In the app: Create account. The API has no email provider yet, so the "email" is written to `apps/api/.dev-mail/` (a text file with the link). Open the link on the phone (or paste the code into the Verify email screen), then sign in.
4. Emailed links use `chartnexa://verify-email?token=...` in development builds and `exp://<ip>:8081/--/verify-email?token=...` in Expo Go. The code can always be pasted by hand.

## Where things are stored
- **Refresh token and session id:** only in the device's secure storage (iOS Keychain, Android Keystore), under the key `chartnexa.session.v1`, set to "when unlocked, this device only".
- **Access token:** only in memory; it is never written anywhere.
- **Account details, sessions list:** only in the in-memory query cache, cleared at sign out.
- **Nothing secret is logged.** Tests run every flow with the console watched and fail if a password, code or token appears.

## How the session behaves
- At launch the splash stays up while the app checks secure storage and renews the session; a signed-in person never sees the sign-in screen flash.
- The server rotates the refresh token on every use and treats a reused one as theft, ending the whole session. The app therefore shares one renewal among all requests, saves the new refresh token before using the new access token, and never sends a used token again.
- A 401 triggers one renewal and one retry. A rejected renewal signs the person out and returns them to the same screen after signing in again. Being offline or a server error never signs anyone out.
- Sign out clears the device first; telling the server is best effort (offline, the server session ends on its own schedule and the screen says so).
- Known limitation: if the app is killed in the instant between the server rotating the token and the phone saving the new one, the next launch presents a rotated token and the server ends the session; the person signs in again.

## Contract tests against the real API
`pnpm --filter @chartnexa/mobile test:contract` starts the real API on a throwaway PostgreSQL database and runs the app's auth layer against it over HTTP (needs a local PostgreSQL, like the API tests). `pnpm test` runs both the unit and contract tests. CI's `mobile` job has a PostgreSQL service for this.

## Courses in the app
- **Catalog (Home):** published courses newest first, search after typing pauses, level chips, loads more as you scroll. Opening a course and coming back keeps the search, level and scroll position. A course page shows the cover, level, price (whole dollars or Free) and description, and says enrollment is coming (there is no buy button).
- **Staff (Profile, then Manage courses):** shown only when `/me/access` includes course permissions (the server still checks every request). Create a draft, edit it, then publish it after a confirmation. Price is typed in dollars ("49.5" is saved as $49.50; more than two decimals is refused). If someone else changed the course, the app says so and offers "Use latest version" without losing what you typed.
- **Try it:** sign up and verify in the app, make that account an Admin with `admin:bootstrap` (see the API README), sign in again, create and publish a course, then see it in the Home catalog from any account.
- Money is whole US cents everywhere; dollars appear only on screen and in the staff form.

## Instructor permissions in the app
- **Profile, then Instructor permissions** (Admins and Managers only; the server checks every request). Type a person's exact email and press Find. An Instructor opens a page of their permissions, in words, with the course each applies to. **Add permission** opens a sheet: pick what they can do, the course if it needs one, and a reason. **Remove** asks for a reason too. Managers see "Publish and unpublish courses" dimmed; only an Admin can give it.
- **Admins** can also press **Make Instructor** on someone who is not one, and **Remove Instructor role** on the person's page (this ends all their permissions).
- **Instructors** see Manage courses only when they have been given access, and only their own courses. New course appears only with "Create new courses"; Publish appears only with the publish permission on that course.
- **Try it on the phone:** make account A an Admin (`admin:bootstrap`), create account B in the app. As A: Profile > Instructor permissions > find B > Make Instructor > Add permission > "Create new courses". Sign in as B: Profile > Manage courses > New course. Back as A, give B "Publish and unpublish courses" for that course, and B can publish it.
