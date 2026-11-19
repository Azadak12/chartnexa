# Spec Delta

## ADDED Requirements

### Requirement: Instructor access is by invitation
Admins and Managers SHALL invite an email address to become an Instructor. One open invitation per address SHALL exist (also under simultaneous requests). The emailed single-use code SHALL expire after 7 days and be revocable and resendable.

#### Scenario: Acceptance
- **WHEN** the invited person accepts with a valid code
- **THEN** a verified account with the Instructor role exists and the code cannot be used again

#### Scenario: Uniform refusal
- **WHEN** the code is unknown, expired, used, revoked or the password is wrong
- **THEN** the answer is the same single message

### Requirement: Admins deactivate Instructors without losing records
Deactivation SHALL be Admin only, need a reason, end the role, every course permission and every session in one transaction, keep the courses published with the instructor's name, and write an audit event. Managers SHALL be refused and the refusal audited.

#### Scenario: Repeat
- **WHEN** an already deactivated person is deactivated again
- **THEN** the answer is 404 and nothing changes
