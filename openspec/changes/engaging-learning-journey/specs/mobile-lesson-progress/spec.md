## ADDED Requirements

### Requirement: Confirmed completion leads forward
An enrolled reader with server-confirmed completion SHALL see a completion panel with course progress and an available next lesson action, or a course-complete message when every lesson is done. Undo SHALL remain available for text lessons.

#### Scenario: Complete a lesson
- **WHEN** confirmed progress includes the current lesson
- **THEN** the completion panel appears and the next incomplete lesson can be opened

#### Scenario: Failed or duplicate completion
- **WHEN** completion fails or is pressed twice quickly
- **THEN** no unconfirmed success is shown and at most one mutation is sent at a time

#### Scenario: Preview
- **WHEN** a non-owner reads a preview
- **THEN** no personal completion panel is displayed
