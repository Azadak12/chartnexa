import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { colors, market, radii } from "../theme";
import { useReducedMotion } from "../ui";

const SHADES = [colors.blue, market.blueOnNavy, colors.ink, colors.blueTint, colors.champagne];
const COUNT = 16;

/** A one-shot burst of confetti around its parent's centre. Nothing is drawn with reduced motion. */
export function Burst({ radius = 90 }: { radius?: number }) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced !== false) return;
    Animated.timing(t, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduced, t]);
  if (reduced !== false) return null;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", top: 24, left: 24, width: 0, height: 0 }}
    >
      {Array.from({ length: COUNT }, (_, i) => {
        const a = (i / COUNT) * Math.PI * 2;
        const d = radius * (0.7 + (i % 3) * 0.2);
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              width: i % 2 ? 8 : 10,
              height: i % 2 ? 8 : 10,
              borderRadius: i % 4 === 0 ? 2 : radii.pill,
              backgroundColor: SHADES[i % SHADES.length],
              opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
              transform: [
                {
                  translateX: t.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.cos(a) * d],
                  }),
                },
                {
                  translateY: t.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.sin(a) * d + 24],
                  }),
                },
                {
                  rotate: t.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0deg", `${i * 50}deg`],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
