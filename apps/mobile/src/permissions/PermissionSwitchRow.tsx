import { Switch, View } from "react-native";
import type { PermissionSource } from "@chartnexa/api-contracts";
import { colors, neutrals, radii, spacing } from "../theme";
import { Text } from "../ui";
import { SOURCE_LABEL, expiryText } from "./labels";

export interface PermissionSwitchRowProps {
  label: string;
  help?: string;
  value: boolean;
  source: PermissionSource;
  /** Overrides the standard words for the source (for example for a course grant). */
  sourceText?: string;
  expiresAt: string | null;
  disabled?: boolean;
  lockedReason?: string | null;
  /** True once the Admin has moved the switch from what is saved. */
  changed?: boolean;
  onChange: (next: boolean) => void;
  testID: string;
}

/** One switch with its name, plain-language help, where it comes from and when it ends. */
export function PermissionSwitchRow({
  label,
  help,
  value,
  source,
  sourceText,
  expiresAt,
  disabled = false,
  lockedReason,
  changed = false,
  onChange,
  testID,
}: PermissionSwitchRowProps) {
  const ends = expiryText(expiresAt);
  const origin = sourceText ?? SOURCE_LABEL[source];
  return (
    <View
      testID={testID}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text variant="bodyStrong">{label}</Text>
        {help ? (
          <Text variant="caption" tone="muted">
            {help}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          <Text
            variant="caption"
            testID={`${testID}-source`}
            style={{
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: source === "role" ? neutrals.border : colors.blue,
              paddingHorizontal: spacing.sm,
              overflow: "hidden",
            }}
          >
            {origin}
          </Text>
          {ends ? (
            <Text variant="caption" tone="muted" testID={`${testID}-ends`}>
              {ends}
            </Text>
          ) : null}
          {changed ? (
            <Text variant="caption" tone="muted">
              Not saved yet
            </Text>
          ) : null}
        </View>
        {lockedReason ? (
          <Text variant="caption" tone="muted" testID={`${testID}-locked`}>
            {lockedReason}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
        disabled={disabled}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.blue }}
        testID={`${testID}-switch`}
      />
    </View>
  );
}
