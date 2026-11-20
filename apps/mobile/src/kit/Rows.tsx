import { Feather } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { colors, neutrals, radii, spacing, status } from "../theme";
import { Text } from "../ui";

type Icon = React.ComponentProps<typeof Feather>["name"];

/** A compact settings row: icon, label, optional detail, chevron. */
export function ProfileMenuRow({
  icon,
  label,
  detail,
  onPress,
  destructive = false,
  testID,
  last = false,
}: {
  icon: Icon;
  label: string;
  detail?: string;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      testID={testID ?? `row-${label}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: 52,
        paddingHorizontal: spacing.md,
        backgroundColor: pressed ? neutrals.surface : colors.surface,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: neutrals.divider,
      })}
    >
      <Feather
        name={icon}
        size={20}
        color={destructive ? status.error : colors.blue}
        accessible={false}
      />
      <Text
        style={{ flex: 1, color: destructive ? status.error : colors.ink }}
        variant="bodyStrong"
      >
        {label}
      </Text>
      {detail ? (
        <Text variant="caption" tone="muted">
          {detail}
        </Text>
      ) : null}
      {!destructive ? (
        <Feather name="chevron-right" size={18} color={neutrals.muted} accessible={false} />
      ) : null}
    </Pressable>
  );
}

/** A titled group of rows in one rounded card. */
export function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        variant="caption"
        tone="muted"
        accessibilityRole="header"
        style={{ textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: spacing.xs }}
      >
        {title}
      </Text>
      <View
        style={{
          borderRadius: radii.card,
          borderWidth: 1,
          borderColor: neutrals.divider,
          overflow: "hidden",
          backgroundColor: colors.surface,
        }}
      >
        {children}
      </View>
    </View>
  );
}

/** A number with a label, for dashboards. Only ever shown with real data. */
export function DashboardMetricCard({
  label,
  value,
  hint,
  icon,
  onPress,
  testID,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: Icon;
  onPress?: () => void;
  testID?: string;
}) {
  const body = (
    <View
      style={{
        flex: 1,
        minWidth: 140,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: neutrals.divider,
        backgroundColor: neutrals.surface,
        padding: spacing.md,
        gap: 2,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        {icon ? <Feather name={icon} size={16} color={colors.blue} accessible={false} /> : null}
      </View>
      <Text variant="heading">{value}</Text>
      {hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${hint ? `. ${hint}` : ""}`}
      onPress={onPress}
      testID={testID ?? `metric-${label}`}
      style={{ flex: 1, minWidth: 140 }}
    >
      {body}
    </Pressable>
  ) : (
    <View
      testID={testID ?? `metric-${label}`}
      style={{ flex: 1, minWidth: 140 }}
      accessible
      accessibilityLabel={`${label}: ${value}${hint ? `. ${hint}` : ""}`}
    >
      {body}
    </View>
  );
}
