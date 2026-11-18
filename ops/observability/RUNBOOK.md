# API operations runbook

Thresholds are starting points, not measured targets: there has been no load test yet (roadmap `load-capacity`). Tune them once real traffic exists. These rules have not been loaded into a running Prometheus; a unit test only checks their structure.

Every log line has `requestId` and `traceId`. Use them to follow one request. Unexpected errors are logged as `unhandled error` with `err.type`, `err.code` and `err.errorClass` (`dependency` or `server`), never with the error message.

## ApiDown
The API stopped answering scrapes.
1. Check `GET /health/live`. If it fails, the process is down: look at the platform's restart events and the last log lines before exit (configuration errors name the variable).
2. If live works but scrapes fail, check the scraper's `METRICS_TOKEN`.

## ApiHighServerErrorRate
More than 2% of requests answer 5xx.
1. Group recent `unhandled error` lines by `err.errorClass` and `route`.
2. `dependency`: go to ApiDependencyFailures. `server`: a bug, often after a deploy. Compare with the deploy time and roll back if it matches.

## ApiDependencyFailures
Requests fail because the database or network cannot be reached.
1. Check `GET /health/ready` (database reachable within 2 seconds).
2. Check database connections against `DATABASE_POOL_MAX` times the number of instances, and whether the database itself is up.
3. `P2024` means the connection pool timed out: reduce instances or raise the database's connection limit.

## ApiSlowResponses
The 95th percentile is above 1 second.
1. Find the slow routes: `topk(5, histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[10m]))))`.
2. Check the database for slow queries on those routes and for lock waits (review and progress writes lock the course row).

## ApiEventLoopBlocked
The process is busy with CPU work.
1. Password hashing (Argon2) is the usual cause during login bursts; check login rates and `RL_LOGIN_*`.
2. Check memory (`process_heap_used_bytes`) for leaks that cause long garbage collection.
