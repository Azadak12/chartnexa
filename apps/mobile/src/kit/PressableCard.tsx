import { useRef, type ReactNode } from "react";
import { Animated, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { useReducedMotion } from "../ui";

/**
 * A pressable surface that eases down to 98 percent while pressed. With reduced motion (or before
 * the setting is known) it does not move; the caller's pressed style still shows.
 */
export function PressableCard({
  children,
  onPress,
  style,
  pressedStyle,
  accessibilityLabel,
  accessibilityHint,
  testID,
  minHeight,
  accessibilityRole = "button",
}: {
  children: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  accessibilityHint?: string;
  testID?: string;
  /** Guaranteed tap-target height on the pressable itself. */
  minHeight?: number;
  accessibilityRole?: "button" | "link";
}) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => {
    if (reduced !== false) return;
    Animated.timing(scale, { toValue: v, duration: 90, useNativeDriver: true }).start();
  };
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onPressIn={() => to(0.98)}
      onPressOut={() => to(1)}
      testID={testID}
      style={minHeight ? { minHeight } : undefined}
    >
      {({ pressed }) => (
        <Animated.View style={[style, pressed ? pressedStyle : null, { transform: [{ scale }] }]}>
          {children}
        </Animated.View>
      )}
    </Pressable>
  );
}
