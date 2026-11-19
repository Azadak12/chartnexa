# Operations screens: audit log and order statuses

## Why
Roadmap Phase 8 (`audit-viewer`, part of `ops-lists-reports`). The API already serves the audit log (`audit:read`, Admins) and every order's status (`payments:read_status`, Admins and Managers, R03), but no screen shows them, so operators cannot see what happened without database access.

## What changes
- App only: Profile offers "Audit log" and "Orders" to people holding the permissions; the server still checks every request.
- Audit log: newest first, filter by outcome and action, details (before, after, ids, request id) on demand, paging, empty, error and no-access states.
- Orders: newest first, filter by status, staff wording ("Paid twice, needs a refund decision"), test mode stated, no card or payout data.

## Out of scope
Reports and dashboards (need owner decisions on metrics, Q-series), exports, refunds (blocked on payment strategy), an Admin web workspace (deployment pending).
