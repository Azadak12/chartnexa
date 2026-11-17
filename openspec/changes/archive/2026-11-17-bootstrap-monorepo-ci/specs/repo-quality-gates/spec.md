# Spec Delta

## Purpose

Defines the automated health checks every change to the ChartNexa repository must pass, so that broken, insecure or unverifiable code cannot be merged unnoticed.

## ADDED Requirements

### Requirement: Fresh clone installs and verifies
The repository SHALL let a developer on a clean machine install dependencies and run all checks using documented commands, with the Node version pinned.

#### Scenario: Clean install and check
- **WHEN** a developer clones the repository and follows the documented install and check commands
- **THEN** install succeeds from the committed lockfile and the check command exits with success

#### Scenario: Wrong Node version
- **WHEN** a developer runs install with a Node version outside the pinned range
- **THEN** the install fails or warns with a message naming the required version

### Requirement: Required checks run on every change
CI SHALL run install, lint, typecheck, test and build on every push and pull request.

#### Scenario: All checks pass
- **WHEN** a pull request contains code that passes every check
- **THEN** CI reports success for each step

#### Scenario: Type error
- **WHEN** a pull request introduces a TypeScript type error in any package
- **THEN** the typecheck step fails and CI reports failure

#### Scenario: Failing test
- **WHEN** a pull request makes any test fail
- **THEN** the test step fails and CI reports failure

#### Scenario: Lint violation
- **WHEN** a pull request introduces a lint violation
- **THEN** the lint step fails and CI reports failure

### Requirement: Failed checks block merge
Changes with a failing required check SHALL NOT be mergeable into the main branch.

#### Scenario: Merge attempt with failing CI
- **WHEN** a pull request has a failing required check and a merge is attempted
- **THEN** the merge is blocked until the check passes

### Requirement: Secrets cannot be committed
The repository SHALL detect committed secrets before merge and SHALL keep real environment files out of version control.

#### Scenario: Secret in a commit
- **WHEN** a commit contains a string matching a known secret pattern, such as a private key or provider API key
- **THEN** the secret scan fails the pre-commit hook and the CI check

#### Scenario: Local environment file
- **WHEN** a developer creates a real `.env` file
- **THEN** version control ignores it, and only a placeholder-only `.env.example` is tracked

### Requirement: Shared packages are independently verifiable
Each shared package SHALL build, typecheck and test on its own and SHALL declare its dependencies explicitly.

#### Scenario: Package-level check
- **WHEN** the check commands are run for one package only
- **THEN** that package builds, typechecks and tests without requiring unrelated packages to be modified

#### Scenario: Undeclared dependency
- **WHEN** a package imports a module it has not declared as a dependency
- **THEN** a check fails and names the package and module

### Requirement: Dependency vulnerabilities are surfaced
CI SHALL report known high-severity dependency vulnerabilities, and update automation SHALL propose dependency updates.

#### Scenario: High-severity advisory
- **WHEN** a dependency has a known high or critical advisory
- **THEN** the audit step fails or flags it so a maintainer must act or record an exception
