import { Feather } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
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
  /** Optional control inside the field (for example show or hide password). */
  accessory?: ReactNode;
  inputRef?: ComponentProps<typeof TextInput>["ref"];
  /** Inline style: a leading icon and the label as the placeholder, with no label above. */
  icon?: ComponentProps<typeof Feather>["name"];
}

/**
 * Visible label above the field; the error sits beside it with an icon and text (never color
 * alone) and is exposed to screen readers together with the field.
 */
export function TextField({ label, error, accessory, inputRef, icon, ...input }: TextFieldProps) {
  return (
    <View style={styles.group}>
      {icon ? null : <Text variant="bodyStrong">{label}</Text>}
      <View
        style={[styles.field, icon ? styles.fieldInline : null, error ? styles.inputError : null]}
      >
        {icon ? <Feather name={icon} size={20} color={neutrals.muted} accessible={false} /> : null}
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          accessibilityHint={error ? `Error: ${error}` : undefined}
          aria-invalid={error ? true : undefined}
          allowFontScaling
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          placeholderTextColor={neutrals.muted}
          {...(icon ? { placeholder: input.placeholder ?? label } : {})}
          style={[styles.input, icon ? styles.inputInline : null]}
          {...input}
        />
        {accessory}
      </View>
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
  field: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: MIN_TOUCH_SIZE,
    borderWidth: 1.5,
    borderColor: neutrals.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
  },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH_SIZE - 4,
    paddingVertical: spacing.sm,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    color: colors.black,
  },
  fieldInline: {
    gap: spacing.sm,
    minHeight: 52,
    backgroundColor: neutrals.surface,
    borderWidth: 1,
  },
  inputInline: { minHeight: 48 },
  inputError: { borderColor: status.error },
  errorRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  errorText: { flexShrink: 1 },
});
