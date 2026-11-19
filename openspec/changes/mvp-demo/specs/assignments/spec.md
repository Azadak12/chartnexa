# Spec Delta

## ADDED Requirements

### Requirement: Instructors author and assign coursework
Holders of `assignments:manage` for a course SHALL create assignments (title, instructions, optional lesson of that course, due date, one attachment) as drafts or published, and assign published ones to people with active access to that course. A request naming anyone outside the course SHALL fail entirely.

#### Scenario: Outsider
- **WHEN** a student without access is included in an assignment request
- **THEN** the request is refused and no one receives the assignment

### Requirement: Students hand in and receive feedback
A student SHALL see only assignments that are published, assigned to them and in a course they still own. They SHALL be able to change their answer until feedback is given, after which it is locked; changes after the due date are marked late.

#### Scenario: Locked
- **WHEN** feedback has been given and the student tries to change the answer
- **THEN** the answer is 409 and the work is unchanged
