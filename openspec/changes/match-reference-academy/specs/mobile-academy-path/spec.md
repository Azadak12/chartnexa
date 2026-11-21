# Spec Delta

## Purpose
Defines the Academy structure that mirrors the reference app: overall progress, a strip of courses, a hero for the current course and unit cards leading into the lesson path.

## ADDED Requirements

### Requirement: Progress card with course strip
The progress card SHALL show the real number of lessons done out of the total across the student's courses, and below it a sideways-scrolling strip with one card per owned course showing its title, its position and a progress bar from real lesson progress. Pressing a card SHALL open that course.

#### Scenario: Student owns courses
- **WHEN** a student owns three courses
- **THEN** the strip shows three cards, each with that course's real progress

#### Scenario: Student owns no courses
- **WHEN** a student owns none
- **THEN** the progress card and strip are not shown and the empty state explains how to find courses

#### Scenario: Progress request fails
- **WHEN** the progress call fails
- **THEN** the screen shows a retryable error state and no placeholder numbers

### Requirement: Course hero card
The Academy screen SHALL show a hero card for the selected course with its title, short description, and "lessons done of total", using only stored data. It SHALL NOT show a mastery percentage, "strong" label or rank unless the backend stores that measure.

#### Scenario: Selected course
- **WHEN** a course with 12 lessons and 3 completed is selected
- **THEN** the hero shows "3/12 lessons" and no mastery badge

### Requirement: Unit cards over the lesson path
Each module of the selected course SHALL appear as a unit card with its number, title, completed-of-total count and progress ring, above its lessons on the path.

#### Scenario: Course with modules
- **WHEN** a course has three modules
- **THEN** three unit cards appear in order with real counts

### Requirement: Every lesson stays reachable
The path SHALL NOT lock lessons; it guides the next lesson but every lesson remains openable.

#### Scenario: Lesson not yet reached
- **WHEN** a student presses a lesson that is not next
- **THEN** the lesson opens
