# mobile-review-moderation Specification

## Purpose
The app screens staff use to moderate reviews and decide appeals.

## Requirements

### Requirement: Students can report a review
Each review by someone else SHALL offer a Report action that opens a sheet with the reasons, an optional note and a submit button that cannot be pressed twice.

#### Scenario: Report sent
- **WHEN** the person picks a reason and submits
- **THEN** the sheet closes, an announcement confirms it, and focus returns to the review

#### Scenario: Failure
- **WHEN** the request fails or the device is offline
- **THEN** the sheet stays open with a clear message and Retry, and nothing is duplicated

#### Scenario: Already reported or gone
- **WHEN** the person reported before, or the review is no longer visible
- **THEN** they see a neutral confirmation or a "no longer available" message, never an error code

### Requirement: Authors see a hidden review and can appeal
The author's own review SHALL show a text banner (not color alone) saying it is hidden from other students, with the reason, the note and an Appeal action, and the later decision.

#### Scenario: Hidden banner
- **WHEN** the author opens the course page with a hidden review
- **THEN** the banner shows the reason and note, and Edit and Delete still work

#### Scenario: Appeal
- **WHEN** the author submits an appeal message
- **THEN** the banner shows "Appeal sent" and the action is no longer offered

#### Scenario: Decision
- **WHEN** the appeal is decided
- **THEN** the banner shows the outcome and the moderator's note

### Requirement: Moderators get Reviews screens
A person with `reviews:moderate` SHALL see a Reviews screen with Reported, Hidden and Appeals tabs, a detail screen, and sheets to hide, restore and decide, with loading, empty, error and offline states. Others SHALL see no entry and a clear message if they reach it.

#### Scenario: Hide from detail
- **WHEN** a moderator hides a review with a reason
- **THEN** the detail updates, the queue refreshes, and the result is announced

#### Scenario: Reason list
- **WHEN** the hide sheet opens
- **THEN** it offers the fixed reasons only, tells the moderator the author will read the note, and requires a note for "other"

#### Scenario: Permission lost
- **WHEN** the server answers 403 to a staff action
- **THEN** the screen shows a clear message and the controls disappear

### Requirement: The moderation controls are accessible
All controls SHALL have text labels, targets of at least 44 points, announcements for results, and focus return after sheets close.

#### Scenario: Screen reader
- **WHEN** a screen reader user reports a review or appeals a hiding
- **THEN** every control is labeled, states are spoken, and results are announced
