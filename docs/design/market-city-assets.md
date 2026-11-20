# Market City — artwork production spec

**Status 2026-11-21: artwork NOT delivered.** The tools used so far cannot produce photorealistic imagery. `apps/mobile/src/city/MarketCity.tsx` ships a clearly provisional vector skyline (with a visible notice) that fixes the layout, tap areas, lighting and motion. Do not treat it as final art.

## How to deliver
Drop WebP files in `apps/mobile/assets/city/` and set `source: require(...)` in `src/city/city-assets.ts`. Tap areas are percentage boxes in the same file, so the art only has to match the scene frame. The notice disappears once all four slots are filled.

## Common rules
- Aspect exactly **10:9** (e.g. 1600×1440 px). Delivered at 2x and 3x phone density from one master; WebP, ≤ 350 KB per layer.
- One art direction: photorealistic / cinematic architectural visualisation of a finance-academy campus at blue hour. Midnight `#070B14` base, electric-blue `#3D8BFF` rim light, gold `#F5C542` window light. No cartoon, no flat vector, no watermark, original or licensed with written terms.
- Keep the bottom 12% calm (labels sit there) and the upper-left quarter low in contrast (greeting overlaps on small phones).

## Layers (transparent PNG-in-WebP unless noted)
| Slot | File | Content |
|---|---|---|
| sky | `sky.webp` (opaque) | Dusk sky, soft cloud bands, horizon glow. Drifts slowly (±5%). |
| skyline | `skyline.webp` | Distant towers with lit glass and atmospheric haze. |
| campus | `campus.webp` | Four hero buildings whose footprints match `DESTINATIONS` boxes: Academy (x .05–.28, y .30–.80), Library (x .30–.50, y .46–.80), Observatory with dome (x .52–.73, y .38–.80), Mission Center (x .75–.95, y .52–.80). |
| foreground | `foreground.webp` | Plaza, reflections, planters, edge vignette. |

Also needed later (not yet wired): lesson-theatre backdrop, course-cover set, auditorium (live classes), observatory interior (lab), instructor/manager/admin header images (sparing, never behind forms).
