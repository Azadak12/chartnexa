import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View, type LayoutChangeEvent } from "react-native";
import { accents, colors, MIN_TOUCH_SIZE, neutrals, radii, spacing } from "../theme";
import { Text, useReducedMotion } from "../ui";

/**
 * Two to four choices in one rounded track. A white "pill" slides under the selected one (native
 * driver, 180ms), or jumps there with reduced motion. Selection is also shown in words and by
 * weight, and announced to screen readers; each choice is at least 44dp high.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.key === value),
  );
  const x = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const inner = Math.max(0, width - TRACK_PAD * 2);
  const cell = options.length > 0 ? inner / options.length : 0;
  useEffect(() => {
    if (cell === 0) return;
    const to = index * cell;
    if (!placed.current || reduced !== false) {
      x.setValue(to);
      placed.current = true;
      return;
    }
    Animated.timing(x, { toValue: to, duration: 180, useNativeDriver: true }).start();
  }, [index, cell, reduced, x]);
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{
        flexDirection: "row",
        padding: TRACK_PAD,
        borderRadius: radii.control + 4,
        backgroundColor: accents.blue.tint,
      }}
    >
      {cell > 0 ? (
        <Animated.View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          testID={testID ? `${testID}-indicator` : "segment-indicator"}
          pointerEvents="none"
          style={{
            position: "absolute",
            top: TRACK_PAD,
            bottom: TRACK_PAD,
            left: TRACK_PAD,
            width: cell,
            borderRadius: radii.control,
            backgroundColor: colors.white,
            borderWidth: 1,
            borderColor: neutrals.divider,
            transform: [{ translateX: x }],
          }}
        />
      ) : null}
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.key)}
            testID={testID ? `${testID}-${o.key}` : undefined}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: MIN_TOUCH_SIZE,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: spacing.sm,
            }}
          >
            <Text
              variant="bodyStrong"
              style={{ color: selected ? accents.blue.ink : neutrals.muted, textAlign: "center" }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const TRACK_PAD = 4;
