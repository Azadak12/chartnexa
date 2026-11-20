# Course discovery upgrade

The next student UI upgrade after the guided learning journey, requested on 2026-11-20.

## Explore

A discovery introduction, visible level and topic chips, and full-width artwork cards with real course summaries, instructor names, ratings and prices. The existing filter sheet remains available for choosing several filters before applying. Search, filters and scroll restoration remain intact. A pending search now merges with the latest level/topic selection rather than overwriting it. Failed topic and pagination requests have retry controls.

## Course details

Course artwork and category lead into the title, teacher, price and rating. An at-a-glance panel shows actual lesson and preview counts. Non-owners get an invitation naming the available preview alongside the existing purchase/access flow. Enrolled students see their progress and next lesson in a highlighted panel. Review navigation prevents duplicate requests and reports failures. Failed outline loading offers retry and is no longer presented as an empty course.

## Boundaries and review

No backend, purchase, enrollment or payment-policy changes. No new packages, fabricated ratings, course outcomes or popularity rankings. The existing free-course access notice and test checkout are retained.

Verification passed: 861 tests across 61 mobile suites, TypeScript, scoped lint/format, strict spec validation, and iOS/Android production exports. Evidence is recorded in `course-discovery-experience`. Device visual review remains unverified: no iOS simulator tools are installed here. Review long titles, larger fonts, topic chip scrolling, course cards and preview/continue panels on small phones before release.
