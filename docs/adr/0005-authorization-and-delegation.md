# ADR-0005: Authorization and permission delegation

- **Status:** Accepted (owner, 2026-11-17)
- **Date:** 2026-11-17
- **Related:** C05, C06, Q06, X05

## Context
Instructor capabilities are individually grantable by Admin or authorized Manager. Managers must not escalate privileges. UI hiding is never security.

## Decision
One central `can(actor, action, resource)` used by every protected read, write and file/media request. Permission grants are `(subject, permission, scope_type, scope_id)`, with course-level scope. The delegation ceiling is data: a Manager may grant only permissions they hold and that are delegated to Managers, never to themselves. Permissions are not embedded in tokens; short token TTL plus a per-user authz version check makes revocation effective quickly. Re-check authorization at the final write of uploads. Audit events are append-only, with actor, target, reason, before/after.

## Alternatives considered
- Role-only RBAC: too coarse for per-instructor control.
- Embedded token claims: stale after revocation.
- Policy engine library (CASL/OPA): possible later; start simple.

## Consequences
Every module depends on the authorization service. Negative tests (escalation, mid-upload unassignment) are mandatory in `rbac-core-and-audit` and `instructor-permission-delegation`.
