# authentication-sessions Specification

## Purpose
Defines how users prove who they are and stay signed in safely: login, short-lived access tokens, rotating refresh tokens that detect theft, and the ability to end sessions.

## Requirements

### Requirement: Login with email and password
The system SHALL authenticate a user by email and password and, on success, issue a short-lived access token and a refresh token bound to a new session.

#### Scenario: Valid credentials
- **WHEN** a user submits the correct email and password
- **THEN** the response contains an access token (10-minute lifetime), a refresh token, and the session id

#### Scenario: Invalid credentials
- **WHEN** the email is unknown or the password is wrong
- **THEN** the response is the same 401 error in both cases, with no indication of which was wrong

#### Scenario: Case-insensitive email
- **WHEN** the user logs in with the email in different letter case
- **THEN** login succeeds

### Requirement: Authentication guard
Protected endpoints SHALL require a valid, unexpired access token whose session is active and whose account is enabled, and SHALL otherwise respond 401 in the error envelope.

#### Scenario: Missing, malformed or expired token
- **WHEN** a protected request has no token, a malformed token, a token signed with the wrong key, or an expired token
- **THEN** the response is a 401 in the error envelope and no data is returned

#### Scenario: Revoked session
- **WHEN** a request uses an access token whose session was revoked
- **THEN** the response is a 401

#### Scenario: Token contents
- **WHEN** an access token is decoded
- **THEN** it contains no email, password data, or permissions

### Requirement: Rotating refresh tokens
Each use of a refresh token SHALL return a new refresh token and access token and invalidate the presented refresh token. Refresh tokens SHALL be stored only as hashes.

#### Scenario: Successful refresh
- **WHEN** a client presents a valid refresh token
- **THEN** it receives a new pair and the old refresh token no longer works

#### Scenario: Reuse of a rotated token
- **WHEN** an already-rotated or revoked refresh token is presented
- **THEN** the whole session is revoked, the request fails with a 401, and the event is logged with the session id

#### Scenario: Simultaneous refresh with the same token
- **WHEN** two requests present the same refresh token at the same time
- **THEN** at most one receives new tokens and the session is revoked if the other is treated as reuse

#### Scenario: Expired session
- **WHEN** a refresh token is past its lifetime or the session passed its 90-day cap
- **THEN** the refresh fails with a 401 and the user must log in again

### Requirement: Logout and revoke
The system SHALL let a user end the current session, all their sessions, or a specific other session, with immediate effect on access tokens.

#### Scenario: Logout
- **WHEN** a signed-in user logs out
- **THEN** the session's refresh token and access token stop working at once

#### Scenario: Logout everywhere
- **WHEN** a user chooses to end all sessions
- **THEN** every session of that user is revoked

#### Scenario: Another user's session
- **WHEN** a user tries to revoke a session belonging to someone else
- **THEN** the request fails as not found and the other session is unaffected

### Requirement: Session listing
A signed-in user SHALL be able to list their active sessions with creation time, last use and a device label, and SHALL NOT see token values.

#### Scenario: List sessions
- **WHEN** a signed-in user lists sessions
- **THEN** only their own active sessions are returned and the current one is marked
