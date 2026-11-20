# 3D classroom: feasibility and what is built (2026-11-21)

## Findings (checked against the repo and the npm registry)
- App stack: Expo SDK 58, React Native 0.88, React 19.3, expo-router, `expo-video` (the lesson player), `react-native-svg`. No 3D, GL, Reanimated or gesture-handler packages are installed.
- A real 3D scene needs `expo-gl` (58.0.4 exists for SDK 58), `three` (0.187), `@react-three/fiber` (9.8) and normally Reanimated. `expo-gl` is a **native module**, so the installed development build cannot load it: it needs a new EAS development build and a new TestFlight/APK before it can run. Compatibility of that exact set with RN 0.88's architecture is **not verified** (nothing installed or built).
- Video: `expo-video` renders in a native surface. Putting it into a GL texture is not supported reliably, so the classroom must show the real player as an aligned native frame, not a video texture. This is what is built.
- Assets: a believable 3D classroom, furniture and realistic avatars need GLB/glTF models and textures that are commissioned or licensed. None exist in the repo and none can be generated with the tools available. Realistic avatars must not be faked with cartoon placeholders.

## Built now (no new dependencies)
`src/classroom/ClassroomStage.tsx`, used by the lesson reader when the lesson has a video. The existing `VideoLesson` (play/pause/seek/fullscreen/speed, resume, watch reports) stays mounted unchanged inside a screen frame. Three camera views (Classroom, Focus screen, Desk) animate the surrounding room and show or hide the desk. The desk offers native buttons to the course lessons, Assignments and My Learning. A visible notice states the scenery is placeholder. Reduced Motion applies instantly.

## Not built (needs assets and a native build)
Real 3D rendering, seated first-person camera, avatars, desk-object interaction, a 3D academy entrance and 3D course destinations. Decision needed: commission GLB assets and approve a new native build (expo-gl + three + r3f), or keep the hybrid image-layer approach with commissioned photoreal renders (`market-city-assets.md`).
