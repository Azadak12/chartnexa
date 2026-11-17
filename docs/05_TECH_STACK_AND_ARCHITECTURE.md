# Technology stack and scalable architecture proposal

**Status: RECOMMENDED, NOT APPROVED** — record as architecture decision after senior engineer review.

## Frontend
- iOS+Android: **React Native + Expo + TypeScript**; Expo Router for navigation; TanStack Query for server cache; Zustand only for small local/UI state; React Hook Form + Zod for forms.
- UI: NativeWind or React Native styling/tokens (choose one after proof of compatibility and build tests); shared semantic brand tokens.
- Optional Admin/Manager/Instructor web workspace: **Next.js + TypeScript**. This is recommended for bulk authoring and management, **not yet confirmed as an additional deliverable**. Deployment roles could instead remain mobile-only; architecture must accommodate client decision.

## Backend
- **NestJS + TypeScript**, modular monolith with domain boundaries: Identity/Access, Profiles, Courses, Curriculum, Assets, Live Sessions, Catalog/Search, Orders/Payments, Entitlements/Enrollment, Learning/Progress, Reviews/Moderation, Notifications, Reporting, Audit.
- **PostgreSQL** as relational source of truth; **Prisma** candidate ORM, with migrations, constraints and transactions.
- **Redis + BullMQ** optional when needed for caches, rate limiting and background jobs; do not depend on cache as primary source of truth.
- **S3-compatible storage + CDN** for approved file assets; separate adaptive streaming video platform/storage pipeline for longer lectures.
- Stripe for permitted web checkout; iOS/Android may require store-compliant billing instead or specific allowed approaches. Single backend entitlement ledger must support compliant purchase sources.
- Deploy Docker services using managed database, secrets management, telemetry, CI/CD and environment isolation. Choose actual cloud after constraints are known.

## Scalability strategy
- Design for potentially **millions of registered users**, but do not claim millions of simultaneous users supported without capacity test evidence.
- Stateless APIs behind load balancer; horizontal scaling; CDN/media offload; batch operations and queues for asynchronous work.
- Index queries by course_id/student_id, stable pagination and query cost monitoring; consider read replicas only with evidence.
- Cache public catalog metadata with explicit invalidation; **never** rely on stale cache to grant paid entitlements.
- Minimize N+1 queries and large payloads. Enforce pagination in admin lists. Use connection pooling and resource limits.
- Set measurable SLO/load targets based on expected concurrent users, catalog size, video concurrency, uptime, p95 API latency, file delivery and acceptable recovery time.

## Architecture decision required before build
- Who uses mobile vs web for each role?
- What countries/regions and distribution channels? What payment mechanism is compliant with App Store/Play requirements?
- Which live provider, media storage/CDN, hosting region, privacy policy and supported languages?
- What are initial/concurrent user targets and budget?

## Monorepo sketch (proposed)
```
apps/mobile
apps/admin-web  # conditional
apps/api
packages/api-contracts
packages/design-tokens
packages/shared-types
docs/
openspec/
CLAUDE.md
```
Use a workspace manager with lockfiles and CI checks; no direct mobile access to database, secrets or internal-only administrative endpoints.
