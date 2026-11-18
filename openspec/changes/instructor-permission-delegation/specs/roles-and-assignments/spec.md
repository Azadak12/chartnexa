# Spec Delta

## ADDED Requirements

### Requirement: Ending an Instructor role ends their grants
Revoking the Instructor role, replacing it with another staff role, or deleting the account SHALL end every active grant of that person in the same transaction as the role change, with the number of grants ended recorded in the audit record.

#### Scenario: Revoke Instructor
- **WHEN** an Admin revokes an Instructor's role
- **THEN** the role and all of their grants end together, and one audit record shows both

#### Scenario: Failure is all or nothing
- **WHEN** ending the grants fails during a role change
- **THEN** the role is unchanged and no grant is ended

#### Scenario: Account deleted
- **WHEN** an Instructor deletes their account
- **THEN** their role and grants end and an audit record is written
