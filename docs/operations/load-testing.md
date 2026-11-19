# Load and capacity testing

Status: **tooling ready, targets proposed, production capacity unknown.** No number of supported users can be stated until these tests run on production-like hosting (not chosen).

## Tools
- `pnpm --filter @chartnexa/api load:env -- --students 200 --courses 20 --lessons 15`: starts the real API on its own scratch database, seeds verified students (each owning three courses), published courses and lessons, and raises address-based rate limits so one machine can act as many people. It prints `READY {json}`; save the JSON after `READY` to a file. Stop it with Ctrl+C, which drops the database. It never touches an existing database.
- `node tools/load/run.mjs --env <file> --users 50 --seconds 60 --p95 300 --errors 0.01 [--think 500] [--loginP95 2000]`: each virtual user signs in once, then repeats a student journey: catalog, course page, reviews, My Courses, lesson outline, a lesson, marking it complete, progress, Continue learning, and unread announcements. It prints p50, p95, p99 and max per route and exits 1 if any route's p95 or the error rate misses its threshold. Sign-in has its own threshold because password hashing is slow by design.
- k6 or a hosted tool can replace the runner for distributed tests; the journey above is the scenario to reproduce.

## Proposed targets (pending owner traffic assumptions, docs/08)
| Measure | Proposal |
|---|---|
| p95, signed-in reads and writes above | at most 300 ms at the expected peak |
| p95, sign-in | at most 2 s at the expected peak sign-in rate |
| Error rate | below 1 % (excluding intended 4xx) |
| Peak concurrent students | owner to supply (Q-series in docs/10); test at 2x that |

## Results so far (development container only)
Recorded 2026-11-19. The environment was one 4-CPU cloud development container running the API (one Node process), PostgreSQL 16 (local, default settings) and the load runner on the same machine. This is **not** representative of production and is not a capacity claim.

| Run | Requests | Throughput | Errors | Slowest p95 (excluding sign-in) | Sign-in p95 |
|---|---|---|---|---|---|
| 20 users, 30 s, no think time | 32,790 | 1,090/s | 0 % | 33.5 ms (marking complete) | 856 ms |
| 100 users, 30 s, no think time | 31,200 | 1,033/s | 0 % | 164.8 ms (Continue learning) | 3.49 s (100 at once) |

**Observations:**
- Throughput levels off near 1,000 requests per second on this machine. Above that, latency rises instead, because the API process and the load generator share 4 CPUs.
- Simultaneous sign-ins are CPU bound (argon2). 100 at once take about 3.5 s each, which misses the 2 s proposal. Before release, measure on the chosen hosting and size instances, or queue sign-ins, accordingly.
- Continue learning and marking complete are the heaviest reads and writes per request. Watch them first.

## Still to do (needs hosting)
1. Run against staging with production-like database sizing, several API instances and a separate load generator.
2. Add video playback (provider-dependent, Q09) and file downloads (storage provider, Q32).
3. Soak test (1 hour or more) for memory growth and connection-pool exhaustion.
4. Record results here with the environment description; never reuse these development numbers as capacity claims.
