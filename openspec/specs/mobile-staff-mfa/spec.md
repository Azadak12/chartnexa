# mobile-staff-mfa Specification

## Purpose
TBD - created by archiving change staff-mfa. Update Purpose after archive.

## Requirements

### Requirement: Sign-in asks for the code when the server says so
When sign-in answers with a challenge, the app SHALL show a code screen (numeric keypad, one-time-code autofill, 6 digits) with "Use a recovery code" and "Back to sign-in", never storing the password or the challenge beyond the screen.

#### Scenario: Right code
- **WHEN** the person enters a valid code
- **THEN** they are signed in and taken to where they were headed

#### Scenario: Wrong code
- **WHEN** the code is refused
- **THEN** a plain message appears at the field, the field is cleared and focused, and typing a new code works; after the server burns the challenge, a message offers to sign in again

#### Scenario: Recovery code
- **WHEN** the person chooses "Use a recovery code" and enters a valid one
- **THEN** they are signed in and told how many recovery codes remain

#### Scenario: Expired challenge
- **WHEN** the challenge has expired
- **THEN** the app returns to sign-in with a clear message and keeps the email

#### Scenario: Double submit
- **WHEN** the button is pressed twice quickly
- **THEN** one request is sent

### Requirement: Staff can enroll in the app
For a setup challenge the app SHALL show the setup key as grouped text with a Copy button, an "Open authenticator app" button using the standard link, a code field, and a Continue button, with accessible labels and no QR-only information.

#### Scenario: Enroll
- **WHEN** the person enters the first valid code
- **THEN** the recovery-codes screen appears

#### Scenario: Cannot open an authenticator
- **WHEN** no app handles the link
- **THEN** the key can still be copied and typed in, and a hint explains this

#### Scenario: Leaving
- **WHEN** the person leaves the screen
- **THEN** nothing is enabled and the key is gone from memory

### Requirement: Recovery codes are shown once and must be acknowledged
The app SHALL show the 10 codes as text, offer Copy, and require the person to confirm "I saved these codes" before continuing; it SHALL never store them or put them in logs or screenshots-friendly places like notifications.

#### Scenario: Acknowledge
- **WHEN** the person confirms they saved the codes
- **THEN** Continue becomes available and they are signed in

#### Scenario: Back button
- **WHEN** the person presses Back before confirming
- **THEN** a dialog warns the codes will not be shown again

### Requirement: Profile shows two-step status for staff
Admins and Managers SHALL see "Two-step sign-in: On" in Profile with "Get new recovery codes" (asking for password and a current code), and nobody else SHALL see these rows.

#### Scenario: Regenerate
- **WHEN** a staff member regenerates codes with a valid password and code
- **THEN** the new codes are shown once and the old ones stop working

#### Scenario: Student
- **WHEN** a Student opens Profile
- **THEN** no two-step rows appear

### Requirement: The new screens are accessible and calm
Fields SHALL have labels and errors tied to them; focus SHALL move to the field after an error; targets SHALL be at least 44 points; text SHALL scale; screen readers SHALL read the setup key in groups; codes SHALL not rely on color.

#### Scenario: Screen reader
- **WHEN** a screen-reader user opens the code screen
- **THEN** focus lands on the code field, the field says it expects 6 digits, and errors are announced
