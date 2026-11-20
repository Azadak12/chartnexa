# Design

## Context
Existing list endpoints already filter by category and level, and return summaries and artwork. Course details have lesson and preview counts. Outline requests already supply preview titles and next lesson names.

## Decisions
Use visible horizontal topic/level chips alongside the existing filter sheet. Keep search debounced but read current filters at timeout to avoid overwriting a simultaneous choice. Reuse the thumbnail and rating primitives in a separate discovery card so other compact cards remain stable. Populate course facts and preview prompts from actual API values. Keep current checkout and entitlement rules. Lock review navigation while resolving its first lesson and show errors rather than swallowing them.

## UX and accessibility
White/black/blue brand, growing layouts, wrapping metadata, minimum 44-point filter targets, selected states and descriptive navigation labels. Preserve list position and filters. Outline failure must not masquerade as empty topics. Pagination has an explicit retry action.

## Security and observability
No new data collection or logging. Existing API authorization, error mapping, request IDs and checkout idempotency remain authoritative. No inferred purchase rights or fabricated outcomes.

## Risks and rollout
Larger cards reduce visible list density in exchange for summaries and artwork. Verify existing navigation tests and the new debounce race test. No migration; revert affected components to roll back. Physical device visual/accessibility checks remain a separate unverified limitation when no simulator is installed.
