# Spec Delta

## ADDED Requirements

### Requirement: A repeatable development demo
A development-only command SHALL create four role accounts, five complete published courses with thumbnails, previews and PDFs, enrolments, simulated purchases, progress, reviews, assignments, an announcement and a live class, using the normal services. Running it again SHALL change nothing that exists. It SHALL refuse to run in production or against a non-local database, store passwords only hashed in the database, and keep generated passwords only in an owner-only ignored file.

#### Scenario: Second run
- **WHEN** the command runs twice
- **THEN** all counts and passwords are identical after the second run

#### Scenario: Two-step stays on
- **WHEN** a demo Admin or Manager signs in with the generated password
- **THEN** a second step is still required
