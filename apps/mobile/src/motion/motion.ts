import { useEffect, useRef } from "react";
import { Animated, AppState, Easing } from "react-native";
import { useReducedMotion } from "../ui";

/** The only durations and curves the app animates with. Keep them few so motion feels related. */
export const motion = {
  /** Taps and small state changes. */
  fast: 120,
  /** Screen content, sheets, expanding sections (local transitions 180-300 ms). */
  base: 240,
  /** Moving between destinations (250-450 ms). */
  navigation: 350,
  /** Major cinematic reveals, only where context permits (450-900 ms). */
  cinematic: 600,
  /** Progress and celebrations. */
  slow: 500,
  /** Ambient scenery: clouds, light. Always slow enough to be ignorable. */
  ambient: 14000,
  easeOut: Easing.out(Easing.cubic),
  easeInOut: Easing.inOut(Easing.sin),
} as const;

/**
 * A 0..1 value that loops slowly for ambient scenery. It does not run with Reduced Motion (it
 * rests at `rest`) and it stops while the app is in the background, so it costs no battery then.
 */
export function useAmbientLoop(duration: number = motion.ambient, rest = 0.5): Animated.Value {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(rest)).current;
  useEffect(() => {
    if (reduced !== false) {
      value.setValue(rest);
      return;
    }
    let loop: Animated.CompositeAnimation | null = null;
    const start = () => {
      loop?.stop();
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration,
            easing: motion.easeInOut,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration,
            easing: motion.easeInOut,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    };
    const stop = () => loop?.stop();
    if (AppState.currentState === "active") start();
    const sub = AppState.addEventListener("change", (s) => (s === "active" ? start() : stop()));
    return () => {
      sub.remove();
      stop();
    };
  }, [reduced, duration, rest, value]);
  return value;
}
