import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import { Text, useReducedMotion } from "../ui";
import type { TextProps } from "../ui/Text";

/**
 * A whole number that counts up briefly (0.45 seconds) when it first appears and eases from the old
 * value to a new one after a refresh. Text that is not a plain whole number ("25+", a dash) and
 * reduced motion show the value at once. Each step is a state change of at most one short
 * number, so this stays cheap.
 */
export function CountUp({ value, ...text }: { value: string } & Omit<TextProps, "children">) {
  const reduced = useReducedMotion();
  const target = /^\d{1,6}$/.test(value) ? Number(value) : null;
  const [shown, setShown] = useState<number | null>(null);
  const anim = useRef(new Animated.Value(0));
  const last = useRef(0);
  useEffect(() => {
    if (target === null || reduced !== false) {
      setShown(target);
      if (target !== null) last.current = target;
      return;
    }
    const from = last.current;
    const a = anim.current;
    a.setValue(from);
    const id = a.addListener(({ value: v }) => setShown(Math.round(v)));
    Animated.timing(a, {
      toValue: target,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      last.current = target;
      setShown(target);
    });
    return () => a.removeListener(id);
  }, [target, reduced]);
  // Before the first step: the real value for reduced motion, otherwise the start of the count.
  const first = target === null ? 0 : reduced === true ? target : 0;
  return <Text {...text}>{target === null ? value : (shown ?? first)}</Text>;
}
