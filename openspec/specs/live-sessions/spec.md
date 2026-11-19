# live-sessions Specification

## Purpose
Schedules, changes and cancels a course's live classes behind a provider boundary, and gives owners the join link only while a class is open.

## Requirements

### Requirement: Staff schedule live classes
Holders of `live:schedule` for a course (role default or Instructor grant) SHALL list, schedule and change its live classes. A class SHALL start in the future, last 15 to 480 minutes and use an https meeting link without credentials. A course SHALL have at most 100 upcoming classes.

#### Scenario: Concurrent scheduling at the limit
- **WHEN** several classes are scheduled at once with room for only some
- **THEN** exactly the allowed number are created and the rest answer 409 `LIVE_TOO_MANY`

#### Scenario: Stale change
- **WHEN** two people change the same class from the same version
- **THEN** one succeeds and the other answers 409

#### Scenario: Started class
- **WHEN** someone moves the start of a class that has started
- **THEN** the answer is 400 and the class is unchanged

### Requirement: Staff cancel classes with a reason
Cancelling SHALL need a reason of 3 to 300 characters that owners see. Repeating it SHALL change nothing. Ended classes SHALL answer 409 `LIVE_ENDED`; cancelled classes SHALL not change (409 `LIVE_CANCELLED`).

#### Scenario: Repeat cancel
- **WHEN** a cancelled class is cancelled again
- **THEN** the answer is the class with its first reason and one audit event exists

### Requirement: Owners see the schedule and join while open
People with active access SHALL list a course's classes that have not ended or ended in the last 14 days, and their upcoming classes across courses, without links. The join call SHALL give the link only from the opening time until the end and record the first request per person.

#### Scenario: Too early
- **WHEN** an owner asks for the link before the class opens
- **THEN** the answer is 409 `LIVE_NOT_OPEN`

#### Scenario: No access
- **WHEN** someone without active access lists or joins
- **THEN** the answer is 403 and nothing is recorded

### Requirement: Links stay out of the audit log
Audit events for live classes SHALL never contain the meeting link.

#### Scenario: Link changed
- **WHEN** the link changes
- **THEN** the audit event says only that it changed
