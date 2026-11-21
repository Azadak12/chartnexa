/**
 * Light touch feedback. `expo-haptics` is a native module: a development app built before it was
 * added does not contain it, and importing it there throws. So it is loaded lazily and any failure
 * means "no haptics", never a crash. Every call is fire-and-forget.
 */
type HapticsModule = typeof import("expo-haptics");

let cached: HapticsModule | null | undefined;

function haptics(): HapticsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose, see above
    cached = require("expo-haptics") as HapticsModule;
  } catch {
    cached = null;
  }
  return cached;
}

function run(fn: (h: HapticsModule) => Promise<void>): void {
  try {
    const h = haptics();
    if (h) void fn(h).catch(() => undefined);
  } catch {
    // Haptics are a nicety; never let them break a tap.
  }
}

/** A soft tick for ordinary taps on buttons and cards. */
export const tapFeedback = () => run((h) => h.impactAsync(h.ImpactFeedbackStyle.Light));
/** A firmer tick for the main action on a screen. */
export const primaryFeedback = () => run((h) => h.impactAsync(h.ImpactFeedbackStyle.Medium));
/** A short success pattern, for a confirmed achievement such as finishing a lesson. */
export const successFeedback = () =>
  run((h) => h.notificationAsync(h.NotificationFeedbackType.Success));
