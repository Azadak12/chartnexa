# Spec Delta

## Purpose

Defines how every screen that loads data shows progress, emptiness, failure, offline status and sign-in problems in a consistent, honest and recoverable way.

## ADDED Requirements

### Requirement: Standard states for every data screen
A screen that loads data SHALL present exactly one of loading, empty, error, offline, unauthorized or content, using shared components.

#### Scenario: Loading
- **WHEN** data is being fetched for the first time
- **THEN** a skeleton or progress indicator is shown, not a blank screen

#### Scenario: Empty
- **WHEN** a request succeeds with no items
- **THEN** an empty state explains what belongs there and, where possible, offers the next action

#### Scenario: Error with retry
- **WHEN** a request fails
- **THEN** an error state shows a readable explanation and a Retry button, and pressing it repeats the request

### Requirement: Human-readable API errors
The app SHALL convert API errors into plain-language messages by error code, SHALL NOT display raw server text, stack traces or technical codes as the main message, and SHALL show the request id in small print so support can trace the problem.

#### Scenario: Server error envelope
- **WHEN** the API returns an error envelope with a code and request id
- **THEN** the person sees a friendly message for that code and the request id as a support reference

#### Scenario: Validation error
- **WHEN** the API returns field-level errors
- **THEN** each message is shown on its field

#### Scenario: Network failure
- **WHEN** the device cannot reach the server
- **THEN** the message says so and differs from a server error

#### Scenario: Unexpected response
- **WHEN** the response is not a valid error envelope
- **THEN** a generic friendly message is shown and nothing from the response body is displayed

### Requirement: Offline awareness
The app SHALL show a non-blocking offline banner while the device has no connection, keep already loaded content visible, and remove the banner when the connection returns.

#### Scenario: Connection lost
- **WHEN** the device goes offline while content is shown
- **THEN** the banner appears and the content stays

#### Scenario: Connection restored
- **WHEN** connectivity returns
- **THEN** the banner disappears

### Requirement: Unauthorized state
When the API answers 401 the app SHALL show an unauthorized state that explains the session ended and offers sign-in, keeping the remembered destination.

#### Scenario: Session ended
- **WHEN** a request returns 401
- **THEN** the person is offered sign-in and returns to the same screen afterward

### Requirement: Duplicate submission is prevented
Actions that change data SHALL ignore repeated triggers while one is in progress.

#### Scenario: Double tap
- **WHEN** a person taps a submit button twice quickly
- **THEN** the action runs once
