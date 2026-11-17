# Spec Delta

## Purpose

Defines how a person creates an account, signs in, verifies their email and recovers a forgotten password from the app, safely and with clear feedback.

## ADDED Requirements

### Requirement: Sign in
The app SHALL let a person sign in with email and password, SHALL show the same message for an unknown email and a wrong password, and on success SHALL take them to where they were headed (or Home).

#### Scenario: Successful sign in
- **WHEN** a person enters a registered email and the correct password
- **THEN** they are signed in and arrive at their remembered destination or Home

#### Scenario: Wrong credentials
- **WHEN** the email is unknown or the password is wrong
- **THEN** the same "Invalid email or password" message appears and the password field is cleared

#### Scenario: Too many attempts
- **WHEN** the server answers that too many attempts were made
- **THEN** the message says to wait and for how long, and the sign-in button stays disabled until then

#### Scenario: No connection
- **WHEN** the device is offline or the server cannot be reached
- **THEN** a message says so and differs from the wrong-password message

#### Scenario: Double submit
- **WHEN** the sign-in button is pressed twice quickly
- **THEN** only one request is sent

### Requirement: Create account
The app SHALL let a person create an account with email, password and an optional display name, SHALL show field-level errors from the server, and SHALL show the same confirmation whether or not the email was already registered, without signing the person in.

#### Scenario: Successful registration
- **WHEN** a person submits a new email and an acceptable password
- **THEN** a confirmation tells them to check their email and then sign in, and they are not signed in

#### Scenario: Existing email
- **WHEN** a person submits an email that already has an account
- **THEN** the same confirmation appears, with nothing that reveals the account exists

#### Scenario: Weak password
- **WHEN** the password is rejected by the server's policy
- **THEN** the reason appears beside the password field and the form keeps what was typed

### Requirement: Verify email
The app SHALL verify an email address from the emailed link or from a code pasted into the app, and SHALL show a clear result.

#### Scenario: Link opens the app
- **WHEN** the person opens the verification link on their device
- **THEN** the app opens the verification screen, verifies the address and shows success

#### Scenario: Pasted code
- **WHEN** the person pastes the code and submits
- **THEN** the same verification happens

#### Scenario: Bad or used code
- **WHEN** the code is expired, used or wrong
- **THEN** one generic "invalid or expired" message appears with an option to request a new email once signed in

#### Scenario: Unverified banner
- **WHEN** a signed-in person's email is not verified
- **THEN** a banner offers to resend the email, and the resend can be pressed only once while sending

### Requirement: Recover a password
The app SHALL let a person request a reset email, SHALL answer identically for any email address, and SHALL let them set a new password from the emailed link or a pasted code.

#### Scenario: Request reset
- **WHEN** a person submits any well-formed email on the forgot-password screen
- **THEN** the same confirmation appears whether or not an account exists

#### Scenario: Reset from link
- **WHEN** the person opens the reset link and submits a compliant new password
- **THEN** the password is changed, any signed-in sessions elsewhere end, and they are sent to sign in

#### Scenario: Weak new password
- **WHEN** the server rejects the new password
- **THEN** the reason appears beside the field and the reset code is not wasted

#### Scenario: Bad or expired code
- **WHEN** the code is invalid, used or expired
- **THEN** one generic message appears with a link to request a new reset email

### Requirement: Password entry is safe and usable
Password fields SHALL be masked with a labelled show or hide control, SHALL declare the right autofill and keyboard type so password managers work, and passwords and codes SHALL NOT be logged or shown in any error.

#### Scenario: Show and hide
- **WHEN** the person presses the show control
- **THEN** the password becomes visible, the control's label changes to hide, and it is masked again when the screen is left

#### Scenario: Secrets stay out of logs
- **WHEN** any account flow runs, including failures
- **THEN** no password, code or token appears in console output
