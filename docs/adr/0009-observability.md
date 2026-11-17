# ADR-0009: Observability

- **Status:** Accepted (owner, 2026-11-17)
- **Date:** 2026-11-17
- **Related:** doc 07, doc 08

## Context
Need to diagnose payment, access and permission issues without leaking personal data.

## Decision
OpenTelemetry traces with a request ID generated or forwarded from the app; structured logs with PII/secret scrubbing; Sentry (or equivalent) on mobile and API; metrics for webhook-to-entitlement latency, pending-order age, playback-token failures, queue depth, p50/p95/p99 latency and error rate; alerts on these. Audit events are separate from logs. Capacity targets stay placeholders until traffic and budget are known; load tests validate them empirically.

## Alternatives considered
- Logs only: cannot trace across mobile, API and workers.
- Vendor APM first: possible, but keep OpenTelemetry to avoid lock-in.

## Consequences
Every change must add instrumentation and a no-PII-in-logs test (doc 08 Definition of Done).
