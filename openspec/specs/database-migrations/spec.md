# database-migrations Specification

## Purpose
Defines how the ChartNexa database schema evolves safely, so every environment can be brought to the same verified state and changes can be reversed.

## Requirements

### Requirement: Versioned repeatable migrations
Schema changes SHALL be made only through versioned, committed migrations that apply in order and are idempotent when re-run.

#### Scenario: Fresh database
- **WHEN** migrations are applied to an empty database
- **THEN** the schema reaches the current version with no errors

#### Scenario: Re-run
- **WHEN** migrations are applied again on an up-to-date database
- **THEN** nothing changes and the command succeeds

### Requirement: Migration rollback path
Each migration SHALL have a documented and tested way to return to the previous schema version in non-production environments, and production rollback steps SHALL be written before a destructive migration ships.

#### Scenario: Roll back one step
- **WHEN** the most recent migration is rolled back on a test database
- **THEN** the schema equals the previous version and a subsequent apply succeeds

### Requirement: Migrations verified on real PostgreSQL in CI
CI SHALL apply all migrations to a real PostgreSQL instance and run API integration tests against it.

#### Scenario: Broken migration
- **WHEN** a pull request contains a migration that fails to apply
- **THEN** the CI database check fails and the pull request cannot merge

### Requirement: Database credentials from configuration only
The API SHALL obtain database connection settings only from environment configuration and SHALL NOT embed credentials in source or migrations.

#### Scenario: Credentials in repo
- **WHEN** a commit adds a database connection string with credentials
- **THEN** the secret scan fails the commit and CI
