# Spec Delta

## Purpose
Defines the app screens where anyone sees a course's lessons and reads preview lessons, and where authorized staff build the course's lessons.

## ADDED Requirements

### Requirement: Lesson list on the course page
The course page SHALL list the course's lessons in order with their titles, and SHALL mark each as "Preview" or "Locked" in text, never by color or icon alone.

#### Scenario: Lessons shown
- **WHEN** a person opens a published course that has lessons
- **THEN** the lessons appear in order, each marked Preview or Locked

#### Scenario: No lessons yet
- **WHEN** the course has no lessons
- **THEN** a plain message says lessons are coming soon

#### Scenario: Loading and failure
- **WHEN** the lessons are loading or fail to load
- **THEN** a loading state or an error with Retry is shown, and the rest of the course page still works

### Requirement: Read a preview lesson
Opening a Preview lesson SHALL show its title and content on a full screen with a clear Back, preserving the course page's position.

#### Scenario: Open preview
- **WHEN** a person opens a Preview lesson
- **THEN** its title and text are shown and Back returns to the same place on the course page

#### Scenario: Locked lesson
- **WHEN** a person opens a Locked lesson
- **THEN** a short sheet says it is available after enrolling and that enrolling is coming soon, with no content shown

#### Scenario: Changed while reading
- **WHEN** the lesson stopped being a preview or was removed since the list loaded
- **THEN** a plain message explains it and offers Back

#### Scenario: Plain text
- **WHEN** content contains angle brackets or similar
- **THEN** it is shown exactly as typed

### Requirement: Staff Lessons screen
For people allowed to manage a course's lessons, the course editor SHALL offer "Lessons", opening a screen that lists the lessons in order with their title and a Preview or not-Preview note, and that offers Add lesson, Move up, Move down and a way to open one for editing.

#### Scenario: Entry point
- **WHEN** an Admin, Manager, or an Instructor with the lesson-upload grant on the course opens the editor
- **THEN** Lessons is shown, and for an Instructor without the grant it is not shown

#### Scenario: Denied directly
- **WHEN** a person without the permission opens the Lessons route
- **THEN** an access-denied state is shown and no lesson data is requested

#### Scenario: Reorder
- **WHEN** staff press Move up or Move down on a lesson
- **THEN** the list shows the new order after the server confirms it, the first lesson has no Move up and the last has no Move down

#### Scenario: Reorder conflict
- **WHEN** someone else changed the lessons meanwhile and the server answers with a conflict
- **THEN** the list reloads and a plain message says the order was changed by someone else

### Requirement: Add, edit and delete a lesson
Staff SHALL add and edit a lesson on a full screen with title, content and a Preview switch, SHALL see field errors beside the fields, and SHALL delete a lesson only after a confirmation that names the lesson.

#### Scenario: Add
- **WHEN** staff enter a valid title and content and save
- **THEN** the lesson appears at the end of the list

#### Scenario: Validation
- **WHEN** the title is too short or the content too long
- **THEN** errors appear beside the fields, typed text is kept, and nothing is sent

#### Scenario: Stale edit
- **WHEN** the server reports the lesson changed since it was opened
- **THEN** the app says so and offers Use latest version without losing typed text

#### Scenario: Delete
- **WHEN** staff confirm deleting a lesson
- **THEN** it disappears from the list; cancelling or going back changes nothing

#### Scenario: Double tap and failures
- **WHEN** Save or Delete is pressed twice, or the server answers 403, 404 or a network error
- **THEN** only one request is sent, and a plain message with a way to retry or go back is shown

### Requirement: Accessible lesson screens
All controls SHALL have text names, at least 44-point targets, announce state changes, restore focus when a sheet or dialog closes, and work at the largest text size without clipping content.

#### Scenario: Reorder without dragging
- **WHEN** a person uses a screen reader
- **THEN** every lesson can be moved using named Move up and Move down buttons, with no drag gesture needed
