import { Feather } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { colors, neutrals, spacing, status } from "../theme";
import { Text } from "../ui";

/** First letters of the first two words of a name, or null when there is no name. */
export function initialsOf(name: string | null | undefined): string | null {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return null;
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

/** The brand mark: three small candles on a blue tile. Decoration only. */
function LogoMark() {
  const candle = (h: number, color: string, key: string) => (
    <View key={key} style={{ alignItems: "center", gap: 1 }}>
      <View style={{ width: 2, height: 4, backgroundColor: color }} />
      <View style={{ width: 6, height: h, borderRadius: 1.5, backgroundColor: color }} />
      <View style={{ width: 2, height: 4, backgroundColor: color }} />
    </View>
  );
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      testID="header-logo"
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: colors.blue,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
      }}
    >
      {candle(10, colors.onBlue, "a")}
      {candle(16, colors.onBlue, "b")}
      {candle(12, colors.champagne, "c")}
    </View>
  );
}

/**
 * The top bar: the brand mark and name on the left; the announcements bell and a profile circle
 * (the person's initials) on the right. A greeting and a one-line subtitle sit below. Nothing here
 * is a score or a count except the real number of unread announcements.
 */
export function AppHeader({
  greeting,
  subtitle,
  unread = 0,
  onBell,
  name,
  onProfile,
}: {
  greeting: string;
  subtitle?: string;
  unread?: number;
  onBell?: () => void;
  name?: string | null;
  onProfile?: () => void;
}) {
  const initials = initialsOf(name);
  return (
    <View style={{ gap: spacing.sm }} testID="app-header">
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <LogoMark />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="subheading" accessibilityRole="header" style={{ color: colors.ink }}>
            ChartNexa{" "}
            <Text variant="subheading" style={{ color: colors.link }}>
              Academy
            </Text>
          </Text>
          <Text
            variant="caption"
            numberOfLines={1}
            accessible={false}
            style={{ color: colors.champagne, letterSpacing: 1.2, fontWeight: "700" }}
            testID="header-tagline"
          >
            PERSONAL TRADING ACADEMY
          </Text>
        </View>
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
            <Feather name="bell" size={20} color={colors.ink} />
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
                  borderColor: colors.surface,
                }}
              />
            ) : null}
          </Pressable>
        ) : null}
        {onProfile ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            onPress={onProfile}
            hitSlop={8}
            testID="header-avatar"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.blue,
            }}
          >
            {initials ? (
              <Text variant="bodyStrong" style={{ color: colors.onBlue }} accessible={false}>
                {initials}
              </Text>
            ) : (
              <Feather name="user" size={20} color={colors.onBlue} accessible={false} />
            )}
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
