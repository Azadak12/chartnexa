# mobile-live-sessions Specification

## Purpose
The app's live-class list and join for owners, the next class on home, and the staff screens to schedule, edit and cancel.

## Requirements

### Requirement: Owners see live classes
The course page SHALL show "Live classes" to owners with each class's local date and time, length, state in words, cancellation reason, and Join while open. Home SHALL show the next class that is not cancelled. Loading, error with Retry, and nothing-scheduled states SHALL be handled.

#### Scenario: Refused join
- **WHEN** joining is refused (not open, ended, cancelled, no access)
- **THEN** the reason is shown and announced and the schedule reloads

### Requirement: Staff manage live classes
Staff with permission SHALL see upcoming and past classes with join counts, schedule and edit on a full screen (local date, 24-hour time, length, link, with the device time zone stated), and cancel through a sheet that asks for the reason.

#### Scenario: Someone else saved first
- **WHEN** a save answers 409 for a stale version
- **THEN** the typed changes stay, the newest version is taken and saving again works
