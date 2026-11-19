import { Feather } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { colors, neutrals, spacing, status } from "../theme";
import { Text } from "../ui";

/** Brand, a greeting and a one-line subtitle, with optional notification access. */
export function AppHeader({
  greeting,
  subtitle,
  unread = 0,
  onBell,
}: {
  greeting: string;
  subtitle?: string;
  unread?: number;
  onBell?: () => void;
}) {
  return (
    <View style={{ gap: spacing.xs }} testID="app-header">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text variant="subheading" accessibilityRole="header" style={{ color: colors.black }}>
          ChartNexa{" "}
          <Text variant="subheading" style={{ color: colors.blue }}>
            Academy
          </Text>
        </Text>
        {onBell ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unread > 0 ? `Announcements, ${unread} new` : "Announcements"}
            onPress={onBell}
            hitSlop={8}
            testID="header-bell"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: neutrals.surface,
            }}
          >
            <Feather name="bell" size={20} color={colors.black} />
            {unread > 0 ? (
              <View
                accessible={false}
                style={{
                  position: "absolute",
                  top: 9,
                  right: 10,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: status.error,
                  borderWidth: 2,
                  borderColor: colors.white,
                }}
              />
            ) : null}
          </Pressable>
        ) : null}
      </View>
      <Text variant="title" testID="header-greeting">
        {greeting}
      </Text>
      {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
    </View>
  );
}
