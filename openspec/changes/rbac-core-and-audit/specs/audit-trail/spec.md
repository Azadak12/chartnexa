# Spec Delta

## Purpose

Defines the permanent record of privileged actions and blocked attempts, so the academy can answer who changed access, when, why and what happened.

## ADDED Requirements

### Requirement: Privileged changes are audited atomically
Every role assignment, change, revocation and bootstrap SHALL write an audit record in the same transaction as the change, so there is never a change without a record or a record without a change.

#### Scenario: Successful change
- **WHEN** an Admin assigns a role
- **THEN** exactly one audit record exists with actor, target, action, reason, before and after roles, request id and outcome success

#### Scenario: Failed change
- **WHEN** a role change fails after validation
- **THEN** no audit record claims it succeeded

### Requirement: Denied attempts are recorded
Denied attempts at role management or audit reading SHALL be recorded with outcome denied, the actor and the target, without changing any role.

#### Scenario: Escalation attempt
- **WHEN** a Manager tries to make themselves Admin
- **THEN** a denied audit record names the Manager as actor and target, and the Manager's role is unchanged

### Requirement: Audit records are immutable
Audit records SHALL NOT be updatable or deletable through the application or its database role.

#### Scenario: Update attempt
- **WHEN** an UPDATE or DELETE is attempted on an audit record with the application's credentials
- **THEN** the database rejects it

#### Scenario: Truncate attempt
- **WHEN** a TRUNCATE is attempted on the audit table with the application's credentials
- **THEN** the database rejects it

### Requirement: Audit records hold no secrets
Audit records SHALL contain only identifiers, role and permission names, reasons and request ids, and SHALL NOT contain passwords, tokens, hashes or email addresses.

#### Scenario: Inspect a record
- **WHEN** an audit record is read
- **THEN** it contains none of the account's email, password data or tokens

### Requirement: Admins can read the audit trail
Admins SHALL be able to list audit records newest first with cursor pagination and filter by actor, target, action, outcome and date range; other roles SHALL be denied.

#### Scenario: Filtered listing
- **WHEN** an Admin filters by target user
- **THEN** only records for that user are returned, in stable order, one page at a time

#### Scenario: Non-Admin read
- **WHEN** a Manager requests the audit trail
- **THEN** the response is 403 and the attempt is audited as denied
