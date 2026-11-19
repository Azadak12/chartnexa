## Why
Physical Android testing of the Phase 2 UI found: Explore filters taking a screen of buttons, an oversized Home chart, course cards that clip the price and overlap the rating, unclear back behaviour, and no easy way to try the four roles.

## What changes
Responsive `CourseCard`; Explore filters in a bottom sheet with removable chips and a result count; a compact Home market card (reveals once, respects reduced motion, pauses off-focus); a "Purchase Course" / "Watch Preview" journey with a path to My Learning; back arrows and tab history; a development-only Demo Accounts hub that prefills public emails and uses the normal secure sign-in.

## Impact
Mobile app only. No API or database change. The hub is off in production builds and unless `EXPO_PUBLIC_DEMO_ACCOUNTS=true` is set (the `development` and `preview` EAS profiles set it). See `docs/demo/ux-corrections.md`.
