# Design

## Decisions

1. **No new dependencies.** Metrics are a small in-process registry (counters, a histogram with fixed buckets, gauges) rendered as Prometheus text 0.0.4. `prom-client` and OpenTelemetry were considered; they are reasonable later, but the baseline does not need them and adding SDKs needs a compatibility review (CLAUDE.md).
2. **Request serializer:** `url` becomes `path?name1=&name2=` with values dropped; `remoteAddress` stays (needed for abuse investigation, documented in docs/07).
3. **Error serializer:** `{ type, code, errorClass, stack }`, where `stack` is the frame lines only (the first line of a stack repeats the message). HttpExceptions below 500 are not logged as errors.
4. **Classification:** `dependency` when the error is a Prisma initialization or known connection error (codes `P1001`, `P1002`, `P1008`, `P1017`, `P2024`) or a Node network error (`ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`); otherwise `server`.
5. **Route label:** Fastify's matched route pattern (`/courses/:courseId/reviews`), or `unmatched` for 404s on unknown paths, so label cardinality stays bounded.
6. **`/metrics` access:** non-production: open. Production: 404 unless `METRICS_TOKEN` is set; with it, the bearer token must match (constant-time compare), otherwise 401. Not rate limited (scrapers poll it) and excluded from its own counts.
7. **Trace id:** from `traceparent` (`00-<32 hex>-<16 hex>-<2 hex>`, not all zeros), otherwise random 32 hex. Logged as `traceId`; echoed as `x-trace-id`.
8. **ErrorReporter:** `report(error, context)` where context holds request id, trace id, route and method only. Default implementation logs at `error`. Registered as a provider so tests can replace it.

## Risks

- In-process metrics reset on restart and are per instance; the scraper aggregates. Acceptable for a baseline.
- Alert rules are written but not loaded into a Prometheus here; their syntax is checked by a test that parses the YAML, not by `promtool`.
