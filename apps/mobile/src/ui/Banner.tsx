import { Feather } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { colors, radii, spacing, status } from "../theme";
import { Text } from "./Text";

export type BannerKind = "info" | "success" | "warning" | "error";

const kinds: Record<
  BannerKind,
  {
    icon: React.ComponentProps<typeof Feather>["name"];
    label: string;
    fg: string;
    bg: string;
    tone: "link" | "success" | "warning" | "error";
  }
> = {
  info: { icon: "info", label: "Note", fg: colors.blue, bg: colors.blueTint, tone: "link" },
  success: {
    icon: "check-circle",
    label: "Success",
    fg: status.success,
    bg: status.successTint,
    tone: "success",
  },
  warning: {
    icon: "alert-triangle",
    label: "Warning",
    fg: status.warning,
    bg: status.warningTint,
    tone: "warning",
  },
  error: {
    icon: "alert-circle",
    label: "Error",
    fg: status.error,
    bg: status.errorTint,
    tone: "error",
  },
};

/** Status is carried by an icon and a text label as well as color. */
export function Banner({
  kind = "info",
  message,
  testID,
}: {
  kind?: BannerKind;
  message: string;
  testID?: string;
}) {
  const k = kinds[kind];
  return (
    <View
      testID={testID}
      style={[styles.row, { backgroundColor: k.bg }]}
      accessibilityRole={kind === "error" ? "alert" : "text"}
      accessibilityLabel={`${k.label}: ${message}`}
    >
      <Feather name={k.icon} size={20} color={k.fg} accessible={false} />
      <Text variant="caption" tone={k.tone} style={styles.message}>
        <Text variant="caption" tone={k.tone} style={styles.strong}>
          {k.label}:{" "}
        </Text>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.control,
  },
  message: { flexShrink: 1 },
  strong: { fontWeight: "700" },
});
