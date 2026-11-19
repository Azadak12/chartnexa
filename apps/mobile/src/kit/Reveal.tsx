import { useEffect, useRef, type ReactNode } from "react";
import { Animated } from "react-native";
import { useReducedMotion } from "../ui";

export const REVEAL_STAGGER_MS = 70;
export const REVEAL_MAX_DELAY_MS = 280;

/**
 * Fades and lifts its content into place once, a little after the one before it (`index`). It
 * plays on first appearance only, uses the native driver, and does nothing with reduced motion:
 * the content is simply there. Until the setting is known the content stays transparent for a
 * moment so it never flashes before it animates.
 */
export function Reveal({ index = 0, children }: { index?: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const played = useRef(false);
  useEffect(() => {
    if (reduced === null || played.current) return;
    played.current = true;
    if (reduced) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay: Math.min(index * REVEAL_STAGGER_MS, REVEAL_MAX_DELAY_MS),
      useNativeDriver: true,
    }).start();
  }, [reduced, index, progress]);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
