# Spec Delta

## ADDED Requirements

### Requirement: The API names the course to resume
`GET /me/continue-learning` SHALL answer, for the signed-in person, the course with active access, at least one lesson left, and the most recent activity (completions or video progress, else the access start), with its progress and next lesson; otherwise null.

#### Scenario: Finished and empty courses
- **WHEN** the most recent course is finished or has no lessons
- **THEN** the next most recent unfinished course is answered

#### Scenario: Revoked access
- **WHEN** access to the most recent course is revoked
- **THEN** that course is no longer answered
