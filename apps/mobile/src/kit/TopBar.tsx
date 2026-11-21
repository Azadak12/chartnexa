import { Feather } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { announcementApi } from "../announcements/announcement-api";
import { accountApi } from "../auth/account-api";
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

/** The brand row: mark and name, announcements bell, profile circle. No safe-area padding. */
export function TopBarRow({
  unread = 0,
  onBell,
  name,
  onProfile,
}: {
  unread?: number;
  onBell?: (() => void) | undefined;
  name?: string | null | undefined;
  onProfile?: (() => void) | undefined;
}) {
  const initials = initialsOf(name);
  return (
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
  );
}

/** True under the tab layout, which draws the top bar and handles the top safe area itself. */
export const TopBarPresent = createContext(false);
export const useTopBarPresent = () => useContext(TopBarPresent);

/** The persistent top bar for every role and every tab screen. Real data only. */
export function TopBar() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useQuery({ queryKey: ["me"], queryFn: accountApi.me });
  const unread = useQuery({
    queryKey: ["announcements-unread"],
    queryFn: announcementApi.unread,
    staleTime: 0,
  });
  return (
    <View
      testID="top-bar"
      style={{
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.sm,
        paddingHorizontal: spacing.lg,
        backgroundColor: colors.page,
        borderBottomWidth: 1,
        borderBottomColor: neutrals.divider,
      }}
    >
      <TopBarRow
        unread={unread.data ?? 0}
        onBell={() => router.push("/profile/announcements")}
        name={me.data?.displayName}
        onProfile={() => router.push("/profile")}
      />
    </View>
  );
}
