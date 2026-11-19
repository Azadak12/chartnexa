# Production integration dependencies (review 2026-11-19)

Everything below is either a decision only the owner can make or an account only the owner can open. None of it may be bought, signed up for or switched on by the development agent. "Built" means a provider-neutral boundary plus a development or test adapter. Every development adapter is refused at start-up in production.

| Area | What exists | What production needs | Decision | Blocks |
|---|---|---|---|---|
| Hosting, region, database | Docker-free Node API, migrations with round-trip check, backup and restore scripts (drilled locally) | Hosting provider and region (USA/Canada, C13), managed PostgreSQL with point-in-time recovery, secret store, TLS and domain | docs/05 open questions | Any deployment, load test on real hardware, backup schedule |
| Object storage and CDN | `ObjectStorage` interface; local disk (dev only) | Provider account, buckets, versioning, lifecycle, signed URLs | Q32 | Files and video in production |
| Malware scanning | `Scanner` interface; `none` (dev only) | Scanning service or self-hosted engine | Q33 | File uploads in production |
| Video hosting | `VideoProvider` interface; test adapter with ranged MP4 (no transcoding) | Video platform (transcoding, HLS, signed playback, CDN) | Q09 | Video at scale; shorter link lifetime (security review O2) |
| Payments | Orders, events, state machine, reversals; test provider; webhook signature check | Strategy (Stripe web, store billing, or hybrid), provider accounts and keys, tax, refund handling (N01) | ADR-0008, Q02, Q13, Q19 | Any real-money sale |
| Store billing (iOS, Android) | Nothing beyond the ledger | Apple and Google developer accounts, products, server notifications | ADR-0008 | App store releases with purchases |
| Email | `Mailer` with dev and memory drivers (refused in production) | Transactional email provider, sending domain (SPF, DKIM, DMARC) | Pending | Sign-up verification and password reset in production |
| Push and email notifications | In-app announcements only | Channels, consent, quiet hours; push service (Expo or FCM/APNs) | Q35 | Reminders, announcement delivery outside the app |
| Live classes | `LiveProvider` interface; manual meeting-link adapter (usable as is) | Optional hosted provider for rooms, recordings, attendance | Q03, R38 | Recordings and provider attendance only |
| Error tracking and tracing | Structured logs, request and trace ids, Prometheus metrics, alert rules | Error-tracking service and tracing backend | Q30, Q31 | Production monitoring beyond logs and metrics |
| Mobile builds | Expo app, tests | Working Expo access token (the saved one was rejected); Apple and Google accounts; signing keys | Pending (owner to provide a token) | Installable builds, device QA, store submission |
| Legal and policy | None in code | Privacy policy, terms, data retention, company details for the stores | Owner and counsel | Store listing, real users |

## Requirements already known for the future adapters
- Payment webhooks must verify the provider signature over the **raw** request body (security review O1).
- A paid event must carry the exact amount; a missing or different amount grants nothing (security review S1, enforced in code).
- Storage and video adapters must issue short-lived signed links bound to one object (current links: files 5 minutes, video 4 hours).
- Every new adapter needs a production start-up check like the existing ones, and contract tests against the provider's sandbox before use.
