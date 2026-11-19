# ChartNexa Academy demo: run it on your Android phone

This guide sets up the demo on a Mac and opens it on a physical Android phone. Every command in "Set up the backend" and "Check it works" was executed on a Linux development container with PostgreSQL 16 on 2026-11-20; the macOS and phone steps were **not** run on a Mac or phone and are marked as manual checks.

Nothing here uses real payments, real email or a production service. Purchases are simulated and labelled "test mode".

## 1. Prerequisites (macOS)
- Node 26 and pnpm 12 (the repository pins them; `node --version`).
- PostgreSQL 16: `brew install postgresql@16 && brew services start postgresql@16`.
- Your Mac and phone on the **same Wi-Fi** (not a guest network that isolates devices).
- On the phone: Expo Go from Google Play, **if** it supports this project's Expo SDK 58 (check its store page); otherwise use a development build (section 6).

## 2. Set up the backend
```bash
pnpm install
createdb chartnexa_dev
cp .env.example apps/api/.env
```
Edit `apps/api/.env`: set `DATABASE_URL` for your Mac's PostgreSQL user, and fill the two secrets. Generate each with:
```bash
openssl rand -hex 32
```
```bash
pnpm --filter @chartnexa/api exec prisma migrate deploy
pnpm --filter @chartnexa/api seed:demo
```
The seed loads five courses (30 lessons, 6 preview and lesson videos, 6 PDFs, thumbnails), four demo accounts, ten fictional learners with reviews, two simulated purchases, progress, two assignments, two announcements and one live class. It is safe to run again: it changes nothing that exists. It refuses to run if `NODE_ENV=production` or if the database is not on this computer.

Start the API (it listens on all network interfaces):
```bash
pnpm --filter @chartnexa/api dev
```

## 3. Check it works (from the Mac)
```bash
curl -s localhost:3000/health/ready
curl -s "localhost:3000/courses?limit=5" | head -c 400
```
Expected: `{"status":"ok"}` and JSON for the five courses with `thumbnailUrl`, `instructor` and `categoryName`.

## 4. Demo accounts
| Role | Email | Notes |
|---|---|---|
| Student | `student@chartnexa.test` | Owns Trading Fundamentals (3 of 6 lessons done) and Candlestick Chart Mastery (2 of 6); one assignment handed in, one to do; has a review |
| Instructor | `instructor@chartnexa.test` | Teaches all five courses; create and edit courses, add lessons, videos, PDFs, assignments; cannot publish |
| Manager | `manager@chartnexa.test` | Invites instructors; courses, announcements, reviews, orders (status only); no role management or audit log |
| Admin | `admin@chartnexa.test` | Everything, including deactivating instructors and the audit log |

**Passwords** are generated randomly and saved to `apps/api/.dev-credentials.json` (owner-only, ignored by Git). Show them on your own computer:
```bash
pnpm --filter @chartnexa/api demo:credentials
```
To make new ones (this signs the demo accounts out): `pnpm --filter @chartnexa/api seed:demo -- --reset-passwords`.

### Admin and Manager: two-step sign-in (kept on)
The first time, after the password the app asks you to set up two-step sign-in:
1. The app shows a setup key. Add it to an authenticator app (Google Authenticator, 1Password, etc.) with "enter a setup key".
2. Enter the 6-digit code. The app then shows **recovery codes**: save them.
3. Next time, enter the current code, or a recovery code.

No authenticator app on hand? On your Mac, print the current code from the setup key:
```bash
pnpm --filter @chartnexa/api dev:totp -- "THE SETUP KEY"
```
To start over for a demo account: `pnpm --filter @chartnexa/api seed:demo -- --reset-mfa` (this removes its enrolment so it can be set up again).

## 5. Open the app on your phone
Find your Mac's address and start Expo:
```bash
ipconfig getifaddr en0          # for example 192.168.1.20
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:3000 pnpm --filter @chartnexa/mobile start
```
Scan the QR code with Expo Go. Never use `localhost` for this variable: on the phone it means the phone itself.

Where the app cannot reach the Mac, check: same Wi-Fi, no VPN, macOS Firewall allows Node, and `curl http://192.168.1.20:3000/health/ready` works from another device's browser.

## 6. Development or preview build (if Expo Go cannot be used)
The repository has `development`, `preview` and `production` build profiles (`apps/mobile/eas.json`). They need an Expo account (the Expo access token saved for this project was rejected and must be replaced). Then run `eas login` and `eas build --platform android --profile preview` from `apps/mobile`, with `EXPO_PUBLIC_API_BASE_URL` set to your Mac's address. Preview and development builds show a **Test server** button at the bottom of the Sign In screen so you can point the phone at your Mac without rebuilding.

## 7. What to try (manual acceptance checks on your phone)
Student: register (with the confirm-password field) → read the email in `apps/api/.dev-mail/` for the verify link or code → sign in → browse and search → open a course → play the preview video → read reviews → simulated purchase ("Test mode: no money is charged") → My Learning → open a lesson, mark it complete → Assignments tab: open "Identify Chart Patterns", download the sample charts, submit an answer → write or edit a review.

Instructor: Dashboard → Courses → open a course → change the thumbnail → add a lesson, a video (MP4) and a PDF → Assignments → New assignment → publish → Assign to students → review a submission and give feedback.

Admin or Manager: complete two-step sign-in → Dashboard → Instructors → Invite an instructor (their email arrives in `apps/api/.dev-mail/` as a file containing the accept link and code) → accept it on the phone: tap **I have an invitation** on the Sign In screen and paste the code from that email (or open the link if your build handles the `chartnexa-preview://` scheme) → Admin: Deactivate that instructor.

Things only a phone can confirm (not verified here): video playback smoothness, file download and PDF opening, keyboard and back-button behaviour, large text and screen reader, and slow-network behaviour.

## 8. Feature status
See `docs/demo/feature-status.md` for all 20 required features with backend, app, authorization, automated-test and device status.
