# Paste this entire prompt into Claude Code

You are the principal engineer for **ChartNexa Academy**, a production-grade trading education Learning Management System. Read `README.md`, `CLAUDE.md`, and every file in `docs/` first. The project uses **OpenSpec** for controlled, feature-by-feature delivery.

**IMPORTANT: Architecture/specification planning only for this initial task. Do not write application code or install packages yet.**

Known business decisions: Android+iOS mobile application; roles Student, Instructor, Manager, Admin; Manager handles daily operations under Admin; Admin or authorized Manager controls each Instructor's capabilities; optional recorded and/or live lectures; course materials may include video, images, PDF, Word and approved other formats; one-time course purchase with Stripe desired; lifetime access after verified purchase; enrolled students can rate and review courses. Temporary name ChartNexa Academy, white `#FFFFFF`, black `#111111`, blue `#2563EB`. The UX must be easy, context-preserving and mobile-first.

Large growth is a **design target**, not a claim of demonstrated capacity. Think in terms of horizontal scaling, stateless backend, robust database design, secure streaming/file delivery, observability, load testing and measured capacity.

Deliver in this order:
1. Audit all supplied documentation. Create a concise **Confirmed / Proposed / Pending / Contradictions** matrix. Avoid inventing requirements.
2. Compare viable cross-platform stacks and recommend a single maintainable architecture. Evaluate React Native + Expo, NestJS, PostgreSQL, Prisma, Next.js optional management web, Redis/BullMQ, object storage+CDN, dedicated video provider. Explain alternatives and tradeoffs.
3. Explicitly assess **App Store / Google Play digital course purchase rules** and how they affect the stated Stripe-only preference. Do not implement an unapproved checkout strategy. Identify questions that truly block payments.
4. Define deployment topology, modular backend boundaries, shared API contracts, authentication, per-instructor permissions, entitlement model, file access, database integrity and observability.
5. Produce high-level schemas/ERD, sequence flows for checkout-enrollment, media access and course reviews; identify transactional boundaries, idempotency and concurrency risks.
6. Create a UX navigation policy for all roles: back navigation, modals vs sheets vs full screens, scroll/selection preservation, interruptions, offline/weak-network, accessibility and states.
7. Create a **phased OpenSpec roadmap** with small, independently testable changes, dependencies, acceptance criteria, negative cases, performance and security checks. Avoid one mega-change.
8. Identify the minimum decisions needed from the product owner, and propose reasonable defaults **as proposals** for nonblocking unknowns.
9. Present a final architecture review with risks, effort drivers, cost drivers, and first recommended OpenSpec change. **Stop for review; don't apply changes.**

When approved later, process **one OpenSpec change at a time**, review its spec/design/tasks before implementation, test it, and archive only after verification. Never assert 'production-ready' or 'millions supported' without evidence.
