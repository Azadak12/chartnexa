# Admin Dashboard redesign

Status: implemented and covered by automated tests; **not verified on a physical Android phone**. The screenshot and screen recording mentioned in the brief were not attached, so the work follows the written description.

## Cause of the overlap and the tall cards
The statistics were a wrapping row (`flexWrap: "wrap"`) of children with `flex: 1` and a minimum width. React Native can report such a row's height as one line while its children wrap onto more, so the content after it ("Courses and teaching") was laid over the second line, and the flexible children stretched to fill the space. The fix is structural: `src/kit/Grid.tsx` builds explicit rows (a plain flex row per two cards, `flex: 1`, `minWidth: 0`, one column on narrow or large-text screens). The Instructor and Manager dashboards use the same grid, so the bug is fixed for them too (their look is unchanged).

## What the Admin sees
- **Header:** navy-to-blue surface with "CHARTNEXA ACADEMY", "Admin Dashboard" and "Manage your academy at a glance." A decorative chart mark (invented candles, no prices or percentages) sits beside the text and is dropped on narrow screens or large text.
- **Academy at a glance:** four compact tiles from the real lists: Pending invitations (amber), Instructors (blue), Published courses (emerald), Draft courses (purple). Icon in a soft square, value, label. Height follows content (about 105 to 125dp). Loading shows a skeleton; a failed count shows a dash and retries on tap; a partial count shows `N+`. Each tile opens its screen.
- **Quick actions:** New course, Invite instructor, Manage courses, only those the Admin may use.
- **Course management** (Courses, Categories, Students and access), **People management** (Instructors, Permissions), **Community and operations** (Announcements, Review moderation, Orders, Audit log): the same entries and destinations as before, as cards with an icon, title, description and chevron.
- Pull down to refresh reloads the numbers. Cards ease down briefly when pressed (not with reduced motion).

## Spacing
Page padding 16, 16dp after the status bar, 16 between sections, 12 inside cards, 32 at the bottom so the last card scrolls clear of the tab bar. Text wraps; nothing is fixed-height.

## Tokens
New `accents` (blue, sky, emerald, amber, purple; an ink and a tint each) in `@chartnexa/design-tokens`, with contrast pairings checked by the existing test. Colour is always paired with an icon and words.

## Not changed
Other roles' dashboards (their look), Student screens, permissions, navigation, the Admin tab bar.

## To check on the phone
Header and tiles at your font size; no overlap while scrolling; pull to refresh; last card clear of the tab bar; each tile and card opens the right screen.
