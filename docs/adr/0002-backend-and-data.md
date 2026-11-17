# ADR-0002: Backend architecture and data layer

- **Status:** Accepted (owner, 2026-11-17)
- **Date:** 2026-11-17
- **Related:** P02, P05

## Context
Complex entitlement, permission and payment logic; small team; scale is a design target, not a demonstrated capacity.

## Decision
NestJS modular monolith with enforced module boundaries (Identity, Authz, Courses, Curriculum, Assets, Orders/Payments, Entitlements, Learning, Reviews, Live, Notifications, Reporting, Audit). PostgreSQL as source of truth. Prisma as ORM, with raw SQL migrations for partial unique indexes, CHECK constraints and row locks. Stateless API replicas behind a load balancer, connection pooling. Redis/BullMQ deferred until a measured need; start with a Postgres outbox and simple workers.

## Alternatives considered
- Microservices: operational cost without proven need.
- BaaS (Supabase/Firebase): weak for custom authorization and ledger logic.
- Drizzle/Kysely instead of Prisma: more SQL control, smaller ecosystem for migrations.
- Django/Rails/Go: viable, but no shared language with the clients.

## Consequences
Single deployable, easy transactions. Module boundaries need lint enforcement to allow later extraction. Prisma gaps require raw SQL discipline.
