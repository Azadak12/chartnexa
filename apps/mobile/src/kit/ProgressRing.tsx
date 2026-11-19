import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, neutrals } from "../theme";
import { Text } from "../ui";
import { useReducedMotion } from "../ui/use-reduced-motion";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** A ring showing how much is done. It animates once when the value changes, unless motion is reduced. */
export function ProgressRing({
  completed,
  total,
  size = 64,
  stroke = 7,
  testID = "progress-ring",
}: {
  completed: number;
  total: number;
  size?: number;
  stroke?: number;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const pct = total > 0 ? Math.min(1, completed / total) : 0;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const anim = useRef(new Animated.Value(pct)).current;
  useEffect(() => {
    if (reduced !== false) {
      anim.setValue(pct);
      return;
    }
    Animated.timing(anim, { toValue: pct, duration: 500, useNativeDriver: false }).start();
  }, [pct, reduced, anim]);
  const percent = Math.round(pct * 100);
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${percent} percent complete, ${completed} of ${total} lessons`}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Svg
        width={size}
        height={size}
        style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={neutrals.divider}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.blue}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={anim.interpolate({ inputRange: [0, 1], outputRange: [circ, 0] })}
        />
      </Svg>
      <Text variant="bodyStrong" accessible={false}>
        {percent}%
      </Text>
    </View>
  );
}
