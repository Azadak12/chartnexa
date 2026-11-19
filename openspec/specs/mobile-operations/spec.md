# mobile-operations Specification

## Purpose
The app's audit log for Admins and order status list for Admins and Managers.

## Requirements

### Requirement: Admins read the audit log in the app
People holding `audit:read` SHALL open an audit log from Profile, newest first, filterable by outcome and action, with details on demand and paging. Others SHALL see no entry and a no-access message if they open it, and the app SHALL not request the records.

#### Scenario: Filter cleared
- **WHEN** an Admin clears the filters
- **THEN** the full list is fetched again rather than shown from an old cache

### Requirement: Admins and Managers see order statuses
People holding `payments:read_status` SHALL open Orders from Profile, newest first, filterable by status, with staff wording for each status and test mode stated.

#### Scenario: Duplicate payment
- **WHEN** an order is `duplicate_needs_refund`
- **THEN** it reads "Paid twice, needs a refund decision"
