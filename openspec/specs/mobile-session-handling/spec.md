# mobile-session-handling Specification

## Purpose
Defines how the app keeps a person signed in safely: where tokens live, how the session is restored and renewed, and what happens when it ends.

## Requirements

### Requirement: Tokens are stored only in the safest place
The refresh token SHALL be stored only in the device's secure storage and the access token only in memory, and neither SHALL be written to ordinary storage, logs or error reports.

#### Scenario: After sign in
- **WHEN** a person signs in
- **THEN** only the refresh token and session id are written, to secure storage, and the access token exists only in memory

#### Scenario: Sign out
- **WHEN** a person signs out or the session ends
- **THEN** the stored refresh token is deleted and the in-memory tokens are cleared

### Requirement: Session restored at launch
At launch the app SHALL hold the splash or a neutral screen until it knows whether a stored session is still valid, and SHALL NOT flash the sign-in screen at a person who is signed in.

#### Scenario: Valid stored session
- **WHEN** the app starts with a stored refresh token the server accepts
- **THEN** the person lands in the signed-in area without seeing sign-in

#### Scenario: No or rejected stored session
- **WHEN** nothing is stored or the server rejects the token
- **THEN** the stored token is deleted and the welcome screen appears

#### Scenario: Offline at launch
- **WHEN** the app starts offline with a stored token
- **THEN** the person stays signed in with an offline notice and the session is refreshed once the connection returns, not discarded

### Requirement: Renewal never reuses a refresh token
The app SHALL renew the access token shortly before it expires and once after a 401, SHALL share one renewal among all requests that need it, and SHALL NEVER send a refresh token that was already used.

#### Scenario: Many requests at once
- **WHEN** several requests find the access token expired at the same moment
- **THEN** exactly one renewal call is made and all of them proceed with the new token

#### Scenario: New token saved before use
- **WHEN** a renewal succeeds
- **THEN** the new refresh token replaces the old one in secure storage before any request uses the new access token

#### Scenario: Retry once
- **WHEN** a request returns 401 and a renewal succeeds
- **THEN** the request is repeated once with the new token, and a second 401 ends the session instead of looping

### Requirement: Failure handling distinguishes ended from unreachable
A definitive rejection by the server (401) during renewal SHALL end the session, and a temporary failure (offline, timeout, server error) SHALL NOT.

#### Scenario: Session rejected
- **WHEN** renewal is rejected with 401, for example after the session was revoked
- **THEN** the person is signed out, told the session ended, and returned to the screen they were on after signing in again

#### Scenario: Temporary failure
- **WHEN** renewal fails because the device is offline or the server is down
- **THEN** the person stays signed in, the failed action shows a retryable error, and renewal is tried again later

### Requirement: Sign out is immediate on the device
Signing out SHALL clear the device at once, SHALL ask the server to end the session and SHALL still succeed locally when the server cannot be reached.

#### Scenario: Offline sign out
- **WHEN** a person signs out without a connection
- **THEN** they are signed out on the device immediately and the screen says the server will be told when possible or that the session will expire on its own

#### Scenario: Sign out everywhere
- **WHEN** a person chooses to sign out of all devices and the server confirms
- **THEN** every session ends and this device is signed out

### Requirement: Another device's actions are handled
If the session is ended elsewhere (sign out everywhere, password reset, account deletion), the app SHALL notice at the next request and sign out cleanly.

#### Scenario: Session revoked elsewhere
- **WHEN** the session was ended from another device and the app makes its next request
- **THEN** the person is signed out with a clear explanation
