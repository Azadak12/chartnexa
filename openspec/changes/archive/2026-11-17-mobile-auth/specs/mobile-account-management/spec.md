# Spec Delta

## Purpose

Defines the signed-in area where a person sees and manages their own account: details, name, password, active sessions and deletion.

## ADDED Requirements

### Requirement: Account overview
The Profile area SHALL show the person's display name, email and whether the email is verified, and SHALL show only their own data.

#### Scenario: Verified account
- **WHEN** a person with a verified email opens Profile
- **THEN** their name and email are shown with a verified indicator that uses text as well as color

#### Scenario: Unverified account
- **WHEN** the email is not verified
- **THEN** a notice and a resend action are shown

#### Scenario: Loading and failure
- **WHEN** the account is loading or fails to load
- **THEN** the standard loading and error states appear, with Retry for errors

### Requirement: Edit display name
The person SHALL be able to change their display name in a short sheet, with validation and a saved confirmation.

#### Scenario: Save name
- **WHEN** they enter a valid new name and save
- **THEN** the sheet closes, focus returns to the edit control, and Profile shows the new name

#### Scenario: Invalid name
- **WHEN** the name is empty or too long
- **THEN** the reason appears beside the field and nothing is sent

### Requirement: Change password
The person SHALL be able to change their password by entering the current and a new one, SHALL see field errors, and SHALL stay signed in on this device while other devices are signed out.

#### Scenario: Successful change
- **WHEN** the current password is correct and the new one is acceptable
- **THEN** a confirmation appears and this device stays signed in

#### Scenario: Wrong current password
- **WHEN** the current password is wrong
- **THEN** a message says so beside that field and repeated failures show the wait message

#### Scenario: Other sessions end
- **WHEN** the change succeeds
- **THEN** the sessions list no longer shows other devices

### Requirement: Manage sessions
The person SHALL be able to see their active sessions with device label, started and last-used times and which one is this device, end any other session, and sign out of all devices.

#### Scenario: List sessions
- **WHEN** they open the sessions screen
- **THEN** their active sessions are listed, this device is marked, and no secret values appear

#### Scenario: End another session
- **WHEN** they end another session and confirm
- **THEN** it disappears from the list and that device is signed out at its next request

#### Scenario: Sign out everywhere
- **WHEN** they choose sign out of all devices and confirm
- **THEN** every session ends and this device returns to the welcome screen

### Requirement: Delete account
The person SHALL be able to delete their account only after confirming with their password, SHALL be told what deletion does before confirming, and SHALL be signed out and cleared from the device on success.

#### Scenario: Confirm and delete
- **WHEN** they read the warning, enter the right password and confirm
- **THEN** the account is deleted, the device is cleared and the welcome screen shows

#### Scenario: Wrong password
- **WHEN** the password is wrong
- **THEN** the account is not deleted and a message shows beside the field

#### Scenario: Cancel
- **WHEN** they close the confirmation without confirming
- **THEN** nothing changes and focus returns to the delete control

### Requirement: Destructive actions are confirmed
Ending sessions elsewhere, signing out everywhere and deleting the account SHALL each ask for confirmation in a dialog that names the consequence and has a clearly labelled cancel.

#### Scenario: Back closes the dialog
- **WHEN** a confirmation dialog is open and the person presses back
- **THEN** the dialog closes without performing the action
