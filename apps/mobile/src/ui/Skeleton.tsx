import { useEffect, useRef } from "react";
import { Animated, StyleSheet, type DimensionValue } from "react-native";
import { neutrals, radii } from "../theme";
import { useReducedMotion } from "./use-reduced-motion";

export function Skeleton({
  width = "100%",
  height = 16,
}: {
  width?: DimensionValue;
  height?: number;
}) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced !== false) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, opacity]);
  return (
    <Animated.View
      testID="skeleton"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.bar, { width, height, opacity }]}
    />
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: neutrals.divider, borderRadius: radii.control },
});
