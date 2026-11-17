# Spec Delta

## Purpose

Defines who holds which role in ChartNexa, how roles are assigned and removed safely, and how the very first Admin comes into existence.

## ADDED Requirements

### Requirement: Role model
Every active account SHALL be a Student, and an account MAY additionally hold exactly one staff role: Instructor, Manager or Admin. Disabled or deleted accounts SHALL hold no effective role.

#### Scenario: New account
- **WHEN** a person registers
- **THEN** they are a Student with no staff role

#### Scenario: Disabled staff member
- **WHEN** an account holding a staff role is disabled
- **THEN** it has no effective staff access until re-enabled

### Requirement: Only Admins assign roles
The system SHALL let only an Admin assign, change or revoke a staff role, and SHALL require a reason of 3 to 200 characters for each change.

#### Scenario: Admin assigns a role
- **WHEN** an Admin assigns the Instructor role to an active, email-verified account with a reason
- **THEN** the account becomes an Instructor and the change is audited

#### Scenario: Non-Admin attempts a role change
- **WHEN** a Student, Instructor or Manager attempts to assign or revoke a role
- **THEN** the request is rejected with 403, nothing changes, and the denied attempt is audited

#### Scenario: Missing reason
- **WHEN** a role change is submitted without a reason
- **THEN** it is rejected with a 400 naming the reason field

#### Scenario: Ineligible target
- **WHEN** the target account is disabled, deleted, unknown or has an unverified email
- **THEN** the assignment is rejected and no role changes

### Requirement: No self-service role changes
No account SHALL be able to assign, change or revoke its own role.

#### Scenario: Admin edits own role
- **WHEN** an Admin tries to change or revoke their own role
- **THEN** the request is rejected with 403 and audited as denied

### Requirement: The last Admin is protected
The system SHALL never allow the number of active Admins to reach zero through role changes, including when requests are made at the same time.

#### Scenario: Revoking the only Admin
- **WHEN** an Admin tries to revoke or replace the role of the only active Admin
- **THEN** the request is rejected and the Admin remains

#### Scenario: Two Admins removed simultaneously
- **WHEN** two Admins each try to demote the other at the same moment
- **THEN** at most one demotion succeeds and at least one active Admin remains

### Requirement: Changing roles replaces the previous one
Assigning a new staff role to an account that already has one SHALL end the previous role and start the new one as a single change.

#### Scenario: Promotion
- **WHEN** an Admin changes an Instructor to a Manager
- **THEN** the account holds only the Manager role and one audit record shows the before and after roles

### Requirement: First-Admin bootstrap
The system SHALL provide an operator-run command that makes an existing verified account the first Admin when no active Admin exists, and SHALL refuse to run when an Admin exists unless an explicit recovery flag is given.

#### Scenario: No Admin yet
- **WHEN** an operator runs the command for a verified, active account and no Admin exists
- **THEN** the account becomes Admin and a system-origin audit record is written

#### Scenario: Admin already exists
- **WHEN** the command runs without the recovery flag while an Admin exists
- **THEN** it exits with an error and changes nothing

#### Scenario: Recovery
- **WHEN** the operator runs the command with the recovery flag because the only Admin cannot sign in
- **THEN** the named account becomes Admin and the recovery is clearly marked in the audit record

#### Scenario: Unknown or unverified account
- **WHEN** the named account does not exist, is disabled, or has an unverified email
- **THEN** the command exits with an error and changes nothing

### Requirement: Deleting an account ends its role
Deleting an account SHALL end any staff role it holds, as an audited change, but SHALL NOT be allowed to remove the last active Admin.

#### Scenario: Instructor deletes account
- **WHEN** an Instructor deletes their account
- **THEN** their role is ended and an audit record is written

#### Scenario: Last Admin deletes account
- **WHEN** the only active Admin tries to delete their account
- **THEN** the deletion is rejected with an explanation that another Admin must be appointed first
