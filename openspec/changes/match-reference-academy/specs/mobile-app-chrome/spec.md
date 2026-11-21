# Spec Delta

## Purpose
Defines the persistent top bar and bottom bar of the student app so navigation and identity are always visible and every number shown is real.

## ADDED Requirements

### Requirement: Top bar
The student Home screen SHALL show a top bar with the brand mark and name, an announcements bell, and a profile circle showing the person's initials (or a generic person icon when there is no name). The bell SHALL show an unread marker only when the backend reports unread announcements.

#### Scenario: Signed-in student
- **WHEN** a student with the name "Sam Rivera" opens Home
- **THEN** the profile circle shows "SR" and opens their profile when pressed

#### Scenario: No unread announcements
- **WHEN** the backend reports zero unread announcements
- **THEN** the bell shows no marker and its spoken label is "Announcements"

#### Scenario: Unread announcements
- **WHEN** the backend reports three unread announcements
- **THEN** the bell's spoken label is "Announcements, 3 new"

### Requirement: No invented counters
The top bar SHALL NOT show streaks, XP, coins, levels or any other number that the backend does not store for the student.

#### Scenario: Backend has no such data
- **WHEN** the top bar renders
- **THEN** the only count shown is the real unread announcement marker

### Requirement: Decorative parts are hidden from assistive technology
The brand mark SHALL be hidden from screen readers; the bell and profile circle SHALL have spoken names and a touch target of at least 44 points.

#### Scenario: Screen reader
- **WHEN** a screen reader reads the top bar
- **THEN** it announces the brand name, "Announcements" and "Your profile", and skips the decorative mark
