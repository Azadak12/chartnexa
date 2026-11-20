import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { colors, MIN_TOUCH_SIZE, neutrals, radii, spacing, status } from "../theme";
import { Text, type TextTone } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "tertiary";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  /** Overrides the spoken name when the visible label alone is ambiguous (several Remove buttons). */
  accessibilityLabel?: string;
  testID?: string;
}

/** A loading or disabled button ignores presses, so double taps cannot submit twice. */
export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  accessibilityHint,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  const tone: TextTone = inactive ? "muted" : variant === "primary" ? "onBlue" : "link";
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "primary" && pressed && styles.primaryPressed,
        variant === "secondary" && styles.secondary,
        variant === "tertiary" && styles.tertiary,
        pressed && variant !== "primary" && styles.softPressed,
        inactive && styles.inactive,
      ]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator size="small" color={neutrals.muted} /> : null}
        <Text variant="button" tone={tone} style={styles.label}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // minHeight, never height: the button grows with large text.
  base: {
    minHeight: MIN_TOUCH_SIZE,
    minWidth: MIN_TOUCH_SIZE,
    borderRadius: radii.control,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.blue },
  primaryPressed: { backgroundColor: status.bluePressed },
  secondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.blue },
  tertiary: { backgroundColor: "transparent" },
  softPressed: { backgroundColor: colors.blueTint },
  inactive: { backgroundColor: neutrals.disabledFill, borderColor: neutrals.disabledFill },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { textAlign: "center", flexShrink: 1 },
});
