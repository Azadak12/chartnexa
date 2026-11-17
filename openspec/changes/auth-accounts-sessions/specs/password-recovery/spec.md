# Spec Delta

## Purpose

Defines how a user regains access or changes their password without opening the door to account takeover.

## ADDED Requirements

### Requirement: Forgot password
The system SHALL respond identically to a forgot-password request whether or not the email is registered, and SHALL email a single-use reset token only to a registered address.

#### Scenario: Registered email
- **WHEN** a forgot-password request is made for a registered email
- **THEN** a reset email with a 30-minute token is sent and the response is a generic acknowledgement

#### Scenario: Unknown email
- **WHEN** a forgot-password request is made for an unregistered email
- **THEN** no email is sent and the response is identical to the registered case

### Requirement: Reset password
Redeeming a valid reset token SHALL set a new password that meets the policy, invalidate the token and all other unused reset tokens for the account, and revoke all of the account's sessions.

#### Scenario: Successful reset
- **WHEN** a valid unexpired token and a compliant new password are submitted
- **THEN** the password changes, every session is revoked, and the old password no longer works

#### Scenario: Reused, expired or unknown token
- **WHEN** the token was already used, has expired, or is unknown
- **THEN** the request fails with the same generic error and the password is unchanged

#### Scenario: Reset for a disabled or deleted account
- **WHEN** a reset is attempted for a disabled or deleted account
- **THEN** it fails with the same generic error

### Requirement: Change password
A signed-in user SHALL change their password only by supplying the current password, and the change SHALL revoke all other sessions while keeping the current one.

#### Scenario: Correct current password
- **WHEN** the user supplies the right current password and a compliant new one
- **THEN** the password changes and other sessions are revoked

#### Scenario: Wrong current password
- **WHEN** the current password is wrong
- **THEN** nothing changes and the failure counts toward rate limits
