# Hybrid 3D Academy: audit, conflicts and staged plan (2026-11-22)

Status: **proposal.** Nothing in the app was changed for this brief. Baseline checked today: `apps/mobile` typecheck clean, 69 suites / 897 unit tests pass.

## 1. What exists (inspected)
- Stack: Expo SDK 58, React Native 0.88, React 19.3, expo-router, expo-video, react-native-svg, TanStack Query. **No** Reanimated, gesture-handler, Skia, expo-gl or three installed.
- Roles (all share one tab shell): student, instructor, manager, admin. About 60 routes (see `docs/design/screen-inventory.md`).
- Already built: Market City entrance (provisional art), winding learning path, progress ring, mission cards, live-class tickets, `ClassroomStage` (real `VideoLesson` inside a framed screen, 3 camera views, image layers), `InteractiveCandlestickChart` and quiz in `src/lab` (simulated data, labelled), motion tokens that respect Reduced Motion, staff headers and tokens.
- Reference repo `branhamleonel-pixel/trading-academy` is private but **readable** via the signed-in `gh`. It is a Next.js app (academy, practice, chart-lab, simulator, tutor, challenges, leaderboards, achievements, journal, admin gamification and leagues tabs). It has its own backend; ChartNexa's API has none of that.

## 2. Conflicts with this brief (need an owner answer)
| # | Brief says | Repo says | Proposed handling |
|---|---|---|---|
| C1 | Palette `#101923 / #182838 / #203244 / #13BED0 / #E4AC63` | Owner approved the reference-app palette on 2026-11-21 (`#070B14`, blue `#3D8BFF`, gold `#F5C542`); contrast is enforced by token tests | Keep the approved tokens unless the owner confirms the switch. Switching is a one-file token change plus contrast re-validation, so it is cheap to do later |
| C2 | XP, levels, streaks, quests, leaderboards, achievements, AI tutor, journals | No backend for any of them. Standing rule: never invent XP, streaks or rankings | UI only for data that exists (progress, completion, mastery from lesson/quiz results, live classes). Document the rest as backend-dependent; build nothing fake |
| C3 | Realistic 3D classroom, seated first-person camera | Needs `expo-gl` + `three` + r3f + Reanimated: **native modules**, so a new EAS dev build and TestFlight/APK. Also needs licensed GLB models and textures that do not exist and cannot be generated here | Needs two decisions: approve the native build, and supply or commission assets. Video stays a native overlay aligned to the screen mesh (texture video is unreliable) |
| C4 | Complete work with no approval between phases | CLAUDE.md requires proposal, user review, then implementation per OpenSpec change | Following the more recent explicit instruction for ordinary UI phases, but C1 to C3 are real blockers on scope, so they come first |
| C5 | Manager analytics, charts, cohort performance | Reports are "Not started"; owner decisions on metrics pending (docs/09) | Chart only fields the API already returns |

## 3. Staged roadmap (each is its own OpenSpec change)
1. **academy-motion-foundation**: add Reanimated (SDK 58 compatible version, verified) as a native-rebuild item; shared motion primitives, reduced-motion tests. *Needs new native build.*
2. **student-mission-control**: Home and Academy path polish using existing progress data only.
3. **practice-and-lab-polish**: pan/zoom chart gestures, per-mode practice experiences, over the existing grading and attempt rules.
4. **classroom-3d**: lazy-loaded r3f scene, native video overlay, Standard View fallback, quality tiers. *Blocked on C3.*
5. **staff-studio-ops-command**: instructor, manager, admin redesign (the three "Pending" rows in the screen inventory).
6. **navigation-and-tablet-pass**, then **device QA, performance and accessibility verification** (never done on a real device yet).

## 4. What I can do next without any decision
Stages 2, 3 (non-gesture parts) and 5 need no new dependency and no palette change. I recommend starting with stage 5, because it is the largest area still on the old layout.
