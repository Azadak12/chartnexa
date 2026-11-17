# account-lifecycle Specification

## Purpose
Defines how a person creates, verifies, manages and deletes their own ChartNexa account, so every other feature can rely on a unique, verified and deletable identity.

## Requirements

### Requirement: Register with email and password
The system SHALL let a visitor create one account per email address using a valid email and a password that meets the password policy, treating email addresses case-insensitively.

#### Scenario: Successful registration
- **WHEN** a visitor submits a new email and a compliant password
- **THEN** an account is created, a verification email is sent, and no password or hash appears in any response

#### Scenario: Weak password
- **WHEN** the password is shorter than 10 characters, longer than 128, equal to the email, or on the common-password list
- **THEN** the request is rejected with a 400 and a field-level error on `password`

#### Scenario: Concurrent registrations of one email
- **WHEN** two registrations for the same email (differing only in case) arrive at the same time
- **THEN** exactly one account exists afterward

### Requirement: Email verification
The system SHALL send a single-use verification token by email that expires after 24 hours, and SHALL mark the account's email verified when the token is redeemed.

#### Scenario: Valid token
- **WHEN** a user redeems an unexpired, unused verification token
- **THEN** the email is marked verified and the token cannot be used again

#### Scenario: Expired or reused token
- **WHEN** a token is expired, already used, or unknown
- **THEN** the request fails with the same generic error in each case

#### Scenario: Resend
- **WHEN** a signed-in unverified user requests a new verification email
- **THEN** earlier unused tokens are invalidated and one new token is sent, subject to rate limits

### Requirement: Read and update own profile
A signed-in user SHALL be able to read their own account data and update their display name, and SHALL NOT be able to read or change any other account.

#### Scenario: Read own account
- **WHEN** a signed-in user requests their account
- **THEN** the response contains their id, email, display name and verification state, and no secrets

#### Scenario: Unauthenticated access
- **WHEN** a request without a valid access token asks for account data
- **THEN** the response is a 401 in the error envelope

### Requirement: Account deletion
The system SHALL let a signed-in user delete their account after re-entering their password, immediately ending all sessions and removing personal data.

#### Scenario: Successful deletion
- **WHEN** a signed-in user submits the correct password to delete the account
- **THEN** all sessions are revoked, the email and profile data are erased or anonymized, and logging in with the old credentials fails

#### Scenario: Wrong password
- **WHEN** the password supplied for deletion is wrong
- **THEN** the account is unchanged and the request fails

#### Scenario: Email reuse after deletion
- **WHEN** someone registers with the email of a deleted account
- **THEN** a new, unrelated account is created

### Requirement: Disabled accounts are blocked
An account marked disabled SHALL be unable to log in or use existing tokens, effective on the next request.

#### Scenario: Disabled while signed in
- **WHEN** an account is disabled while its user holds a valid access token
- **THEN** the next authenticated request is rejected with a 401 or 403 in the error envelope
