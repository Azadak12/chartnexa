# Role accounts and logins

Roles are permanent parts of the application (Admin, Manager, Instructor, Student). The five accounts below are ordinary accounts that hold those roles. Their emails and passwords can be changed later without changing roles, permissions, data or dashboards.

| Account | Email | Role | Lands on |
| --- | --- | --- | --- |
| Admin | admin@chartnexa.test | Admin | Admin Dashboard |
| Manager | manager@chartnexa.test | Manager | Manager Dashboard |
| Instructor | instructor@chartnexa.test | Instructor | Instructor Dashboard (all five courses) |
| Lecturer | lecturer@chartnexa.test | Instructor | Instructor Dashboard (its own two courses: Risk Management & Trading Psychology, Options Trading Fundamentals) |
| Student | student@chartnexa.test | Student | Student Home |

Instructor and Lecturer are two separate users with the same role; they have different per-course permissions, so each sees and can change only its own courses. The role always comes from the signed-in account, never from a choice in the app.

## Getting the passwords
Passwords are generated randomly when the demo data is seeded and kept in `apps/api/.dev-credentials.json` (owner-only, ignored by Git). They are not in the app or the repository. On the computer that runs the API:
```bash
pnpm --filter @chartnexa/api seed:demo          # creates anything missing, including the Lecturer
pnpm --filter @chartnexa/api demo:credentials   # prints the five emails and passwords
```
`seed:demo -- --reset-passwords` makes new ones. Running the seed again never creates duplicates.

## Admin and Manager without the second step (local development only)
Add one line to your own `apps/api/.env` and restart the API:
```
MFA_DEV_BYPASS=true
```
Then Admin and Manager sign in with email and password only. The server refuses to start with this flag in production or test, it is off by default, and each skipped step is logged. Leave it `false` anywhere a client or the public can reach. Without it, Admin and Manager still need two-step sign-in (`docs/demo/README.md`).

## Changing an email or password later
```bash
pnpm --filter @chartnexa/api account:update -- --email lecturer@chartnexa.test --new-email lecturer@client.example
NEW_PW='a long new password' pnpm --filter @chartnexa/api account:update -- --email lecturer@client.example --password-env NEW_PW
pnpm --filter @chartnexa/api account:update -- --email student@chartnexa.test --generate-password   # prints it once
```
This changes how the person signs in, not who they are: the account keeps its id, so its role, per-course permissions, purchases, progress, reviews and assignments stay. Its open sessions end so the old password stops working. It is audited. (The `demo:credentials` file is not updated; it only reflects the seeded passwords.)

## Showing the client
The accounts exist only in the database the API runs against. A client on their own phone needs:
1. An API reachable from their phone (a hosted API with a hosted PostgreSQL, or your computer on the same network).
2. An app build pointing at it (an Expo preview build needs a valid Expo token; Expo Go works only on the same Wi-Fi as a local API).
3. That database seeded (`seed:demo`), with `MFA_DEV_BYPASS` left **false** on anything public, which means Admin and Manager use a real authenticator.
None of this is set up yet: there is no hosted environment, so the accounts are **not** remotely accessible today. Share the passwords with the client through a password manager or another private channel, never by committing them.

## Verified (automated, against a real database and the real API)
Sign-in with the right password for all five; wrong password and unknown email both 401 with the same message; Admin and Manager need the second step unless the shortcut is on; the shortcut is refused in production and test; role lists and per-course grants (Instructor 5, Lecturer 2); staff routes by role (courses: staff only; invitations: Manager and Admin; audit log: Admin only); signed-out requests 401; each account sees its own identity and data; credentials change keeps the role, grants and data and ends old sessions; the seed is repeatable. In the app (automated): Sign In is first; each role lands on its own page; sign-out returns to Sign In and Back cannot reach protected screens; switching accounts shows no earlier data.
**Not verified:** anything on a physical Android phone.
