# mobile-lesson-progress Specification

## Purpose
How the app shows and changes lesson completion and course progress.

## Requirements

### Requirement: The reader lets owners mark a lesson complete
For an owner, the lesson reader SHALL show a **Mark as complete** button, which becomes a **Completed** state shown in text (not color alone) with **Mark as not complete** to undo. It SHALL be reachable at every step and in Show all text, and SHALL be absent for people who do not own the course.

#### Scenario: Mark and undo
- **WHEN** an owner marks a lesson complete and then undoes it
- **THEN** the button states change, the server is called once per press, and a failed request shows an actionable message, keeps the previous state and allows a retry

#### Scenario: Double press
- **WHEN** the button is pressed twice quickly
- **THEN** one request is sent

#### Scenario: Preview reader for a non-owner
- **WHEN** someone who does not own the course reads a free preview
- **THEN** no completion control is shown

#### Scenario: Access lost
- **WHEN** the server refuses the mark with 403 because access ended
- **THEN** a friendly no-access message is shown and the completed state does not change

### Requirement: Progress shows in My Courses and on the course page
Each My Courses card and the course page SHALL show "N of M lessons complete" in text and a thin progress bar with a progress role and value text. A course with no lessons SHALL show "No lessons yet".

#### Scenario: Cards
- **WHEN** a person opens My Courses
- **THEN** each course shows its progress without extra loading states per card

#### Scenario: Changes appear
- **WHEN** a lesson is marked complete and the person goes back
- **THEN** the course page and My Courses show the new count

### Requirement: Continue opens the next lesson
The course page SHALL show **Continue** for owners with an incomplete lesson, opening that lesson; **Review course** when all lessons are complete (opening the first); and no button when the course has no lessons. Lessons in the outline SHALL show "Completed" in text for completed ones.

#### Scenario: Continue
- **WHEN** an owner with lessons 1 and 2 complete presses Continue
- **THEN** lesson 3 opens

#### Scenario: All complete
- **WHEN** every lesson is complete
- **THEN** the button reads Review course and opens lesson 1

### Requirement: Progress states are accessible
Progress bars SHALL have labels like "3 of 8 lessons complete"; the mark button SHALL announce its new state; targets SHALL be at least 44 points; nothing SHALL rely on color alone; and text SHALL scale without clipping.

#### Scenario: Screen reader
- **WHEN** a screen-reader user marks a lesson complete
- **THEN** "Lesson marked complete" is announced and the button's name changes
