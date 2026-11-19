# Real invitation email (demo)

The API can send real email through [Resend](https://resend.com). You create the account and the key; nothing is bought or signed up for by the repository. Sending is **not verified by an automated test against the real service**, only against a mocked HTTP call.

1. Create a Resend account and an API key.
2. In `apps/api/.env`:
```
MAILER_DRIVER=resend
RESEND_API_KEY=your key
MAIL_FROM=ChartNexa Academy <onboarding@resend.dev>
```
3. Restart the API.

Resend's test sender `onboarding@resend.dev` only delivers to the email address of your own Resend account unless you verify a domain (check Resend's current rules). For a demo, invite your own address, or verify a domain and set `MAIL_FROM` to it.

## Demo flow
1. Sign in as the Admin or Manager (two-step sign-in) and open Invitations (Manager tab, or Admin > Users).
2. Enter the invitee's email and send. The email arrives with a link and a code.
3. On a second phone or device, open the app > Accept invitation, enter the code, set a name and password.
4. The new Instructor signs in and sees the Instructor tabs. The Admin sees the invitation turn to accepted.

If email does not arrive, check the API log for "Email service refused the message (status N)" and the spam folder. The invitation can be resent from the same screen.
