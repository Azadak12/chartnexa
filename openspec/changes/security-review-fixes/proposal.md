# Fixes from the 2026-11-19 security review

## Why
The internal review (`docs/security/2026-11-19-security-review.md`) found two defects and one process gap.

## What changes
- S1: a paid event must state the order's exact amount; otherwise nothing is granted.
- S2: every API answer carries default security headers unless the route sets its own.
- S3: a test inventories every route and fails on an unreviewed public route, a staff route without a permission check, or a personal route without a sign-in.
- Operations tooling (load-test environment and runner, backup and verified-restore scripts) and runbooks, recorded with their local results.
