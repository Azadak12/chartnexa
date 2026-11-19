# iOS TestFlight (ChartNexa Academy)

Status (2026-11-20): **the project is configured for an iOS production build and upload. No build has been made and nothing has been uploaded**, because three things outside the code are missing (see "Blockers"). Nothing here publishes the app to the public App Store.

## Verified identifiers (from the owner)
| Item | Value |
|---|---|
| App | ChartNexa Academy, iOS, English (Australia) |
| Bundle ID (production) | `com.chartnexa.academy` (development builds use `.dev`, preview `.preview`) |
| App Store Connect app ID | `6836844137` |
| Apple team ID | `MZK8QKSP2U` |
| SKU | `CHARTNEXA-ACADEMY-IOS-001` |

## What is configured
- `apps/mobile/app.config.ts`: production variant uses bundle ID `com.chartnexa.academy`, name "ChartNexa Academy", `ITSAppUsesNonExemptEncryption=false`, no local-network HTTP exception, icon `assets/icon.png` (1024x1024, no transparency) and splash `assets/splash-icon.png`. It refuses to build production against anything but an `https` API on a public host.
- `apps/mobile/eas.json`: `build.production` (store distribution, remote credentials, automatic build numbers, no demo accounts) and `submit.production.ios` with the app and team IDs above.
- Checked with `expo prebuild --platform ios` (Linux, no Xcode): the generated project has bundle ID `com.chartnexa.academy`, a 1024 icon set, and App Transport Security with `NSAllowsArbitraryLoads=false`. Tests: `apps/mobile/__tests__/device-build-config.test.tsx`.
- The icon and splash were generated from the logo in `assets/` by `apps/mobile/scripts/make-icons.py`. The logo is small, so the icon is slightly soft; replace `assets/icon.png` with a designer's 1024x1024 master when you have one.

## Blockers (only you can clear these)
1. **No hosted API.** The development API at `http://192.168.100.201:3000` cannot be used (private address, plain HTTP); the build config refuses it. The repository has no deployment configuration yet (hosting provider and region are undecided, `docs/operations/production-dependencies.md`). A TestFlight build needs a public **https** API.
2. **(Addressed in code, see `docs/operations/render-neon.md`.) The API refuses to start in production with its development adapters** (`apps/api/src/config/config.ts`): local-disk storage, no upload scanner, test video adapter, test payments and the dev mail sender are all rejected when `NODE_ENV=production`, and `MFA_ENCRYPTION_KEY` must be a real key. Until providers exist (decisions Q32, Q33, Q09, payments strategy, email provider), a production-mode API cannot run. Decision needed: either choose and connect those providers, or approve a clearly labelled **staging mode** for the API (a code change, not made here, because running `NODE_ENV=development` on a public server would switch development behaviour on). Email must be real for sign-up verification: `MAILER_DRIVER=resend` with `RESEND_API_KEY` and `MAIL_FROM` is already supported.
3. **Expo and Apple access.** No Expo account token works in this environment (the saved one was rejected earlier) and no Apple credentials are available here. Building and signing need you to log in on your Mac as yourself: `eas login`, and an Apple ID with access to team `MZK8QKSP2U` (App Manager or Admin on App Store Connect).

Never put API secrets in the app: only the public API address is baked in. The two-step shortcut (`MFA_DEV_BYPASS`) is refused by the API in production and on any non-local database, and the mobile production build has no demo accounts.

## Accounts on a hosted API
A fresh hosted database has no demo accounts. Create the first Admin with `pnpm --filter @chartnexa/api admin:bootstrap` (run with the hosted environment), then Admin invites Instructors and appoints Managers in the app. Students sign up themselves (needs working email).

## Commands on your Mac (once the API is hosted)
```bash
git pull origin main
pnpm install
cd apps/mobile
npx eas-cli login
npx eas-cli project:info    # should show kalam124s-team / chartnexa
```
The Expo project (`kalam124s-team/chartnexa`, ID `e8a2dad8-9819-433b-80f3-2ea0da274851`) is built into `app.config.ts`; `EAS_PROJECT_ID` and `EXPO_OWNER` can override it. Set the API address for production builds (a public value, not a secret):
```bash
npx eas-cli env:create --environment production --name EXPO_PUBLIC_API_BASE_URL --value https://<your-api-host> --visibility plaintext
```
If the CLI evaluates the config locally and complains, export `EXPO_PUBLIC_API_BASE_URL` in your shell first.

Build and upload (first run asks for your Apple ID and lets EAS create the distribution certificate and profile):
```bash
APP_VARIANT=production npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --profile production --latest
```
or in one step: `npx eas-cli build --platform ios --profile production --auto-submit`.

Then in App Store Connect → ChartNexa Academy → TestFlight: wait for "Processing" to finish, answer the export-compliance question if shown (the app declares no non-exempt encryption), add **internal testers** (people with App Store Connect access; available at once) or create an **external group** (needs a one-time Beta App Review), and invite your client by email. The client installs the TestFlight app and accepts the invitation.
Do not use "Submit for Review" for the App Store.
