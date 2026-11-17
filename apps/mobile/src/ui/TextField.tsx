import { Feather } from "@expo/vector-icons";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import {
  colors,
  MAX_FONT_SCALE,
  MIN_TOUCH_SIZE,
  neutrals,
  radii,
  spacing,
  status,
  fontFamilies,
} from "../theme";
import { Text } from "./Text";

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  error?: string | undefined;
}

/**
 * Visible label above the field; the error sits beside it with an icon and text (never color
 * alone) and is exposed to screen readers together with the field.
 */
export function TextField({ label, error, ...input }: TextFieldProps) {
  return (
    <View style={styles.group}>
      <Text variant="bodyStrong">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ? `Error: ${error}` : undefined}
        aria-invalid={error ? true : undefined}
        allowFontScaling
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        placeholderTextColor={neutrals.muted}
        style={[styles.input, error ? styles.inputError : null]}
        {...input}
      />
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite" testID="field-error">
          <Feather name="alert-circle" size={16} color={status.error} accessible={false} />
          <Text variant="caption" tone="error" style={styles.errorText}>
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  input: {
    minHeight: MIN_TOUCH_SIZE,
    borderWidth: 1.5,
    borderColor: neutrals.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    color: colors.black,
    backgroundColor: colors.white,
  },
  inputError: { borderColor: status.error },
  errorRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  errorText: { flexShrink: 1 },
});
