import { Pressable, StyleSheet } from "react-native";
import { colors, MIN_TOUCH_SIZE, neutrals, radii, spacing } from "../theme";
import { Text } from "./Text";

/** A selectable filter pill. Selection is shown by fill and by the accessibility state. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.on : styles.off]}
    >
      <Text variant="bodyStrong" tone={selected ? "onBlue" : "body"}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MIN_TOUCH_SIZE,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
    borderRadius: radii.pill,
    borderWidth: 1.5,
  },
  on: { backgroundColor: colors.blue, borderColor: colors.blue },
  off: { backgroundColor: colors.white, borderColor: neutrals.border },
});
