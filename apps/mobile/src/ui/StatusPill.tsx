import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { View } from "react-native";
import { colors, radii, spacing, status } from "../theme";
import { Text } from "./Text";

type Icon = ComponentProps<typeof Feather>["name"];
export type PillTone = "neutral" | "info" | "success" | "warning" | "error";

const TONES: Record<PillTone, { fg: string; bg: string }> = {
  neutral: { fg: colors.ink, bg: colors.page },
  info: { fg: colors.blue, bg: colors.blueTint },
  success: { fg: status.success, bg: status.successTint },
  warning: { fg: status.warning, bg: status.warningTint },
  error: { fg: status.error, bg: status.errorTint },
};

/** A state in words with an icon, never colour alone. One shape for every status in the app. */
export function StatusPill({
  label,
  tone = "info",
  icon,
  testID,
}: {
  label: string;
  tone?: PillTone;
  icon?: Icon;
  testID?: string;
}) {
  const t = tone === "neutral" ? { fg: colors.ink, bg: colors.page } : TONES[tone];
  return (
    <View
      testID={testID}
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radii.pill,
        backgroundColor: t.bg,
      }}
    >
      {icon ? <Feather name={icon} size={12} color={t.fg} accessible={false} /> : null}
      <Text variant="caption" style={{ color: t.fg, fontWeight: "700" }}>
        {label}
      </Text>
    </View>
  );
}
