# Tasks

- [x] 1.1 Migration with `down.sql` (videos, progress, upload purpose); round trip.
- [x] 1.2 Storage compose and range reads; MP4 length reader; provider boundary and test adapter refused in production.
- [x] 1.3 Video upload, replace, remove; playback links and ranged stream; capped heartbeats and completion; manual mark refused for video lessons; account deletion hook; verify 17 integration tests and 4 unit tests.
- [x] 1.4 App: player, speeds, resume, reports, completion, error and retry; staff video section; verify 13 component tests.
- [x] 1.5 Contract test against the real API; CI route check; mutation checks.
- [ ] 1.6 Full checks; archive after CI passes.

## Evidence

- Process note: specs written alongside the implementation under the owner's autonomous-work instruction.
- Full local checks (step by step): lint, format, builds, typecheck, 505 API tests (21 new), 459 app tests (13 new), 38 contract tests (1 new), API and app builds, secrets, migration round trip: all pass.
- Found by the tests and fixed: (1) the "report on leave" effect depended on the report function, which changes with every progress update, so the app would have sent reports in an endless loop (the component test hung); it now calls through a ref on unmount only. (2) A finished file upload could be completed through the video endpoint and the other way round; each endpoint now refuses the other's uploads.
- A time-dependent flaky test was found in the existing rate-limit tests: it assumed 60 s and 61 s windows always start at different seconds, which fails for one minute every hour. It now picks a window whose start differs.
- Mutation checks, all caught after two tests were added: watched time not capped by elapsed time; completion share ignored; watched time not capped by duration (survived at first; test added); no row lock on reports (survived at first: the cap held but simultaneous reports lost time; test added); non-owners recording progress; viewer access not checked; stream token not verified; ranges ignored; manual mark allowed on video lessons; a refused file replacing the earlier video; old bytes kept on replace; progress kept on replace; MP4 header version ignored; file uploads accepted as videos.
- Not verified: real devices (native controls, fullscreen and rotation, background behaviour, battery), real video files from phones and editors (only synthetic MP4 headers were tested), streaming under poor networks, and a production provider.
