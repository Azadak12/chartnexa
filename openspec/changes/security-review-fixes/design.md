# Design
- S1 changes one comparison in `PaymentsService.handleEvent`: `event.amountCents !== order.amountCents` for `paid` (missing counts as different). Existing tests now send the amount, as real providers do.
- S2 sets headers in the Fastify `onSend` hook, with `hasHeader` checks so file and video routes keep their own `content-security-policy` and caching.
- S3 reads Nest's route and guard metadata from the running app (`ModulesContainer`), so it sees every controller without a hand-kept list of controllers. Harness-only `/test` routes are excluded.
