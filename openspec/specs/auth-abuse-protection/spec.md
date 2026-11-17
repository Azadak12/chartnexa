# auth-abuse-protection Specification

## Purpose
Defines how authentication endpoints resist brute force, enumeration and abuse while staying usable for honest users.

## Requirements

### Requirement: Rate limiting
The system SHALL rate-limit register, login, refresh, forgot-password, reset and verification-resend requests per client address and, where an email is supplied, per email, and SHALL answer 429 in the error envelope with a retry hint when a limit is exceeded.

#### Scenario: Repeated failed logins
- **WHEN** more failed logins than the configured limit arrive for one email within the window
- **THEN** further attempts receive a 429 until the window passes, even with the correct password

#### Scenario: Limits shared across instances
- **WHEN** requests are served by different API instances
- **THEN** the same limits apply, because counters are stored in the database

#### Scenario: Honest user unaffected
- **WHEN** a user logs in successfully within normal usage
- **THEN** no limit is triggered

### Requirement: No account enumeration
Authentication endpoints SHALL NOT reveal through status codes, messages or response contents whether an email is registered, except where the caller already proves ownership.

#### Scenario: Registering an existing email
- **WHEN** a visitor registers with an email that already has an account
- **THEN** the response matches a first-time registration and the existing owner is notified by email

#### Scenario: Timing
- **WHEN** login is attempted for an unknown email
- **THEN** the server still performs a password-hash computation so response time does not distinguish the cases

### Requirement: Secrets never exposed
Passwords, hashes, tokens and reset links SHALL NOT appear in structured application logs, error responses or the API documentation examples, and security events SHALL be logged with user id and session id only.

#### Scenario: Failed login log
- **WHEN** a login fails
- **THEN** the log line contains the request id and an outcome code but not the password, token or email

#### Scenario: Production mailer
- **WHEN** the API starts in production with the development mail sender configured
- **THEN** startup fails with a message naming the setting
