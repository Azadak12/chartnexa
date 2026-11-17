# ADR-0007: Media and file delivery

- **Status:** Accepted (owner, 2026-11-17)
- **Date:** 2026-11-17
- **Related:** C08, P04, Q04, Q09

## Context
Paid resources (video, images, PDF, Word, other approved types) must not have permanent public links.

## Decision
Object storage + CDN with short-lived signed URLs for files; a managed video provider with signed playback tokens and asynchronous transcoding status. Uploads: extension allowlist plus MIME/content check, malware scan, size/quota limits, resumable upload, abandoned-upload cleanup. Word documents rendered as PDF for view-only via a sandboxed conversion worker. Playback endpoint authenticates, checks entitlement or staff permission in the database, then mints a scoped token. Revocation takes effect at token expiry; this lag is stated, and we make no DRM claim.

## Alternatives considered
- Self-hosted transcoding (MediaConvert + CDN): cheaper at scale, much more engineering.
- Public CDN links: simplest, unacceptable for paid content.
- Full DRM (FairPlay/Widevine): extra cost, not promised.

## Consequences
Video bandwidth is the dominant cost driver. Provider choice (Mux, Cloudflare Stream, Bunny) is open and should be benchmarked with spend alerts.
