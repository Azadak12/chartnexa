# Phase 2: premium trading UI redesign

Status: implemented on branch `claude/ui-redesign`; automated tests pass; **not verified on a physical device or simulator** (see "Verify on a device").

The design images mentioned in the brief were not attached to the request. The work follows the written specification only.

## What changed, by screen
| Screen | Change |
| --- | --- |
| Student Home | Header with branding, greeting, subtitle and announcements bell (unread count). Simulated candlestick preview with 1H/4H/1D controls and tappable candles. Continue Learning (hidden when nothing to resume, real thumbnail). Next live class. Featured courses. Category shortcuts that open a filtered Explore. |
| Explore | Search, level and category filters, compact cards, loading/empty/error/offline states, search text and scroll restored after going back. |
| Course Details | Hero, price, rating, free-preview button, tabs (Overview, What You Will Learn, Curriculum, Reviews), expandable modules, lesson states (preview, open, locked, completed). Enrolled students see Continue and progress with no success banner and no purchase button. Deep link `?tab=`. |
| Lesson player | Course name, step reading, previous/next lesson (only lessons the person can open), link to the Learning Lab on chart-related lessons (plain keyword match on the lesson's own text). |
| Learning Lab | Simulated candlesticks, OHLC readout, timeframes by real aggregation, moving averages, example support/resistance, zoom, previous/next candle buttons, bullish/bearish exercise. |
| My Learning | Progress summary, All / In Progress / Completed filters, compact thumbnails, Start / Continue / Review. |
| Assignments | Sections To do / Submitted / Reviewed with `AssignmentCard`. |
| Profile | Initials avatar, grouped rows (Account, Learning & Purchases, Security, Staff tools), verification prompt only when needed, Sign out. |
| Staff | Role tab bars, dashboard metrics from real lists, Instructor Assignments hub. |

## Navigation by role
Student: Home, Explore, My Learning, Assignments, Profile. Instructor: Dashboard, Courses, Assignments, Profile. Admin: Dashboard, Users, Courses, More. Manager: Dashboard, Invitations, Profile. The highest role wins. Staff opening Home are redirected to Dashboard. Tabs a role does not use have no button but keep their route, so deep links still work. The server checks every request; the tab bar is only a convenience.

## Design tokens
Brand blue `#2563EB`, text `#111111`, white background, surface `#F8FAFC`, muted `#64748B`, border `#E2E8F0`. Chart surface (`market`): navy `#0F172A`, raised `#1E293B`, grid `#334155`, up `#10B981`, down `#EF4444` (with lighter text variants for contrast on navy). Up/down colors are always paired with a word or symbol (▲ bullish / ▼ bearish). Pairings are covered by the contrast test in `packages/design-tokens`. A test forbids literal colors in app code.

## Component inventory (`apps/mobile/src/kit`, `src/lab`)
AppHeader, SearchBar, CourseThumbnail, CourseCard, FeaturedCourseCard, ProgressRing, ProfileMenuRow, MenuGroup, DashboardMetricCard, ModuleAccordion, LessonCard, AssignmentCard, TabBar, PrimaryButton, SecondaryButton, EmptyState, ErrorState, LoadingSkeleton, VerificationBanner (`src/auth`), ChartCard, InteractiveCandlestickChart, CandleQuiz.

## Honesty limits
- Chart data is **simulated** (seeded, labelled "Simulated educational data. Not a live market."). No prices, ratings or progress are invented elsewhere; everything else comes from the API.
- "What You Will Learn" lists the course's real module (or lesson) titles. The API has no learning-outcomes field.
- Dashboard counts come from one page of each list (25) and show `N+` when more exist.
- There is no users-list API, so the Admin "Users" tab opens the existing instructor invitations and management screen. A full user directory is deferred.
- My Learning cannot show the next lesson title per course (not in the API response); it shows progress and Continue. Home shows the next lesson for the most recent course.
- Image caching relies on the platform image cache; no custom cache was added. Lists use FlatList where they page.
- Reduced motion is respected by the existing `useReducedMotion` hook; the chart has no autonomous animation.

## Verify on a device (not yet done)
1. Run the API and seed the demo data (`docs/demo/README.md`), start the app with Expo.
2. Sign in as each demo role and check the tab bar matches the table above.
3. Home: tap candles, change timeframe, open the Lab, scroll the chart horizontally.
4. Turn on a screen reader and large text; check the chart's previous/next candle buttons and tab selected states.
5. Turn on Reduce Motion and confirm no motion beyond fades.
6. Check on a small phone that nothing overflows horizontally.
