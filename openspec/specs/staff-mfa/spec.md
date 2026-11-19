# staff-mfa Specification

## Purpose
Requires a second sign-in step for Admins and Managers, with recovery codes and audited resets.

## Requirements

### Requirement: Admins and Managers cannot get a session with a password alone
After a correct password, a person whose active staff role is Admin or Manager SHALL receive a challenge, not tokens. Tokens SHALL be issued only after a valid second step. Everyone else SHALL sign in as before.

#### Scenario: Enrolled staff
- **WHEN** a Manager with two-step sign-in enrolled signs in with the right password
- **THEN** the response is a verify challenge and no access or refresh token

#### Scenario: Not enrolled yet
- **WHEN** an Admin who has not enrolled signs in with the right password
- **THEN** the response is a setup challenge and no tokens

#### Scenario: Student and Instructor
- **WHEN** a Student or an Instructor signs in
- **THEN** they receive tokens exactly as before

#### Scenario: Wrong password
- **WHEN** the password is wrong
- **THEN** the answer is the same invalid-credentials failure as before, and no challenge is created

### Requirement: Challenges are short-lived, single-use and limited
A challenge SHALL expire after 5 minutes, work for one successful use only, and be destroyed after 5 wrong codes. It SHALL be stored only as a hash.

#### Scenario: Expired
- **WHEN** a challenge is used after 5 minutes
- **THEN** the answer is a generic failure and the person signs in again

#### Scenario: Used twice
- **WHEN** the same challenge is completed once and then presented again
- **THEN** the second attempt fails and creates no session

#### Scenario: Too many wrong codes
- **WHEN** 5 wrong codes are sent for one challenge
- **THEN** the challenge is destroyed and even the right code then fails

### Requirement: A valid TOTP code completes sign-in once per time step
A code SHALL be accepted when it matches the stored secret within one 30-second step either side of now. A code that was already accepted for that person SHALL be refused, even inside its window.

#### Scenario: Right code
- **WHEN** the person sends the current code
- **THEN** tokens are issued and the step is remembered

#### Scenario: Replay
- **WHEN** the same code is sent again for a new challenge within its window
- **THEN** it is refused

#### Scenario: Clock drift
- **WHEN** the code is from the previous or next step
- **THEN** it is accepted, and one from two steps away is refused

#### Scenario: Wrong or malformed code
- **WHEN** the code is not 6 digits, or does not match
- **THEN** the answer is a generic failure and the attempt is counted against the challenge and the person

### Requirement: Enrollment proves the device works before it counts
During a setup challenge the server SHALL create a secret, return it once, and mark two-step sign-in on only after the person sends a valid first code. It SHALL then issue 10 recovery codes, shown once.

#### Scenario: Complete enrollment
- **WHEN** the person sends a valid first code
- **THEN** two-step sign-in is on, tokens are issued, 10 recovery codes are returned once, and one audit record is written

#### Scenario: Abandoned enrollment
- **WHEN** the person never sends a code
- **THEN** nothing is enabled, and the next sign-in starts a new setup

#### Scenario: Already enrolled
- **WHEN** a setup is attempted for someone who has two-step sign-in on
- **THEN** it is refused and the existing secret is untouched

### Requirement: Recovery codes work once
A recovery code SHALL be accepted in place of a TOTP code, consumed on use, stored only as a hash, and recorded in the audit trail.

#### Scenario: Use a recovery code
- **WHEN** a valid unused recovery code is sent
- **THEN** tokens are issued, the code can never be used again, the remaining count is shown, and one audit record is written

#### Scenario: Reused or unknown code
- **WHEN** a used or unknown recovery code is sent
- **THEN** it fails like a wrong TOTP code

#### Scenario: Regenerate
- **WHEN** a signed-in staff member with a current valid TOTP code and their password asks for new recovery codes
- **THEN** all old codes stop working, 10 new ones are returned once, and it is audited

### Requirement: Lost-device recovery is controlled and audited
An Admin SHALL be able to reset another staff member's two-step sign-in with a reason; nobody SHALL reset their own. The reset SHALL remove the secret and recovery codes, end that person's sessions, and write an audit record. The operator command SHALL be able to do the same for a locked-out sole Admin.

#### Scenario: Admin resets a Manager
- **WHEN** an Admin resets a Manager
- **THEN** the Manager's sessions end, and the next sign-in is a setup challenge

#### Scenario: Not allowed
- **WHEN** a Manager, Instructor or Student calls the reset, or an Admin resets themselves
- **THEN** the response is 403 and nothing changes

#### Scenario: Sole Admin locked out
- **WHEN** the operator runs the reset option for the only Admin
- **THEN** it is audited as an operator action and the Admin can enroll again

### Requirement: Secrets are protected
The TOTP secret SHALL be stored encrypted with a key from configuration, never in logs, audit rows or responses after enrollment. The server SHALL refuse to start in production without a real key.

#### Scenario: Database read
- **WHEN** the stored secret is read directly from the database
- **THEN** it is not usable as a TOTP secret without the key

#### Scenario: Production without a key
- **WHEN** the server starts in production with the development default key or none
- **THEN** it refuses to start

#### Scenario: Logs and audit
- **WHEN** any sign-in, enrollment, recovery or reset happens
- **THEN** logs and audit rows hold ids and outcomes only, never codes, secrets, challenge tokens or recovery codes

### Requirement: Rollout and role changes end old sessions
Assigning the Manager or Admin role SHALL end the person's existing sessions. One migration step SHALL end the sessions of current Admins and Managers.

#### Scenario: Promotion
- **WHEN** a Student with an open session is made a Manager
- **THEN** that session stops working and their next sign-in is a setup challenge

### Requirement: Existing protections still apply
Password rate limits, disabled accounts and deleted accounts SHALL behave as before, and a challenge SHALL never turn a disabled or deleted account into a session.

#### Scenario: Disabled between steps
- **WHEN** the account is disabled after the password step
- **THEN** completing the second step fails and no session is created

#### Scenario: Role removed between steps
- **WHEN** the staff role ends after the password step
- **THEN** completing the challenge issues tokens only if the person is still eligible, and never grants staff permissions that no longer exist
