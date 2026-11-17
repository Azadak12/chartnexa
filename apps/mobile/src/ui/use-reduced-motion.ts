import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * True when the system asks for less motion, false when it does not, and null until the
 * system has answered. Callers animate only when the answer is exactly false.
 */
export function useReducedMotion(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
