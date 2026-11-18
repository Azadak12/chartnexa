# Spec Delta

## ADDED Requirements

### Requirement: Students see the curriculum
The course page SHALL show the lesson outline in order with a visible, text-labelled "Free preview" mark (not color alone) on preview lessons, with loading, empty, error-with-retry and offline states.

#### Scenario: Outline loads
- **WHEN** a student opens a course with lessons
- **THEN** the numbered outline appears below the description, and returning from a lesson keeps the scroll position

#### Scenario: Empty or failed
- **WHEN** the course has no lessons, or loading fails
- **THEN** the page shows "Lessons are coming" or an actionable error with Retry, and the rest of the page stays usable

### Requirement: Students can read preview lessons
Opening a preview lesson SHALL show a full-screen reader with a back header, title and the body as text, with long text scrolling and readable at larger system font sizes.

#### Scenario: Open a preview
- **WHEN** a student taps a preview lesson
- **THEN** the reader opens and Back returns to the same place on the course page

#### Scenario: Locked lesson
- **WHEN** a student taps a non-preview lesson
- **THEN** a bottom sheet explains that enrollment is coming and offers Close; no lesson content is requested

#### Scenario: Lesson disappears
- **WHEN** the course is unpublished or the lesson deleted while the reader is open or being opened
- **THEN** a friendly "no longer available" state with a way back is shown

### Requirement: Staff manage lessons
Staff with lesson rights on a course SHALL see Lessons in the course's management screen with the ordered list, an Add lesson action, and per-lesson edit, move up, move down and delete. Moving SHALL work with buttons, not only drag gestures.

#### Scenario: Add and edit
- **WHEN** staff add a lesson with title, body and the preview switch, or edit one
- **THEN** it is saved, shown in order, and a retry after a lost connection does not duplicate it

#### Scenario: Validation
- **WHEN** staff submit an empty title or too-long text
- **THEN** errors are shown at the fields, tied to them for screen readers, and typed text is kept

#### Scenario: Conflict
- **WHEN** a save is refused because someone else changed the lesson or order
- **THEN** typed text is kept, a message explains, and Reload offers the current version

#### Scenario: Delete
- **WHEN** staff choose Delete
- **THEN** a confirmation dialog names the lesson and says it cannot be undone; Cancel is the default focus

#### Scenario: Without rights
- **WHEN** a person without lesson rights on the course opens the lessons route
- **THEN** a "no access" state is shown and no lesson data is fetched, and the server remains the real check

#### Scenario: Accessibility
- **WHEN** the screens are used with a screen reader and larger text
- **THEN** every control has a label and role, move buttons announce position ("moved to 3 of 8"), focus returns to a sensible control after a sheet or dialog closes, and touch targets are at least 44 points
