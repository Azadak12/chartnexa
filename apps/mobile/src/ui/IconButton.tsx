import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";
import { colors, MIN_TOUCH_SIZE } from "../theme";

export type IconName = React.ComponentProps<typeof Feather>["name"];

export interface IconButtonProps {
  icon: IconName;
  /** Required: screen readers have no other way to name an icon-only control. */
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
  testID?: string;
}

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled = false,
  size = 24,
  testID,
}: IconButtonProps) {
  if (__DEV__ && accessibilityLabel.trim().length === 0) {
    throw new Error("IconButton requires a non-empty accessibilityLabel");
  }
  // Small visual icons still get a 44pt target through the minimum size plus hit slop.
  const slop = Math.max(0, Math.ceil((MIN_TOUCH_SIZE - size) / 2));
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={slop}
      style={styles.target}
    >
      <Feather
        name={icon}
        size={size}
        color={disabled ? colors.black : colors.blue}
        accessible={false}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    minWidth: MIN_TOUCH_SIZE,
    minHeight: MIN_TOUCH_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
});
