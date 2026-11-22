import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import type { ComponentProps } from "react";
import { View } from "react-native";
import { TIP_CATEGORY_LABEL, type TipCategory } from "@chartnexa/api-contracts";
import { Reveal } from "../kit/Reveal";
import { shouldRetry } from "../state/query-client";
import { colors, neutrals, radii, raised, spacing } from "../theme";
import { Button, Text } from "../ui";
import { tipApi } from "./tip-api";

type Icon = ComponentProps<typeof Feather>["name"];
export const TIP_ICON: Record<TipCategory, Icon> = {
  market_basics: "book-open",
  risk_management: "shield",
  technical_analysis: "bar-chart-2",
  trading_psychology: "compass",
};

/** "Sunday, 22 November" from the server's UTC day, so the label matches the tip's day. */
export const dayLabel = (date: string): string =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

/**
 * Today's tip from Home. It is optional content: while loading it shows a quiet placeholder, and
 * when there is no tip or the request fails (offline) it takes no room at all, so it can never
 * block the screen. The tip comes from stored content and is the same all day; when the day
 * changes the new tip fades in. "Learn more" appears only when staff linked a published course.
 */
export function TipOfTheDayCard() {
  const router = useRouter();
  const q = useQuery({
    queryKey: ["tip-of-the-day"],
    queryFn: tipApi.today,
    retry: shouldRetry,
    staleTime: 30 * 60_000,
  });
  if (q.status === "pending") {
    return <View testID="tip-loading" style={{ ...raised, height: 96, opacity: 0.5 }} />;
  }
  const tip = q.data?.tip;
  if (q.status === "error" || !q.data || !tip) return null;
  const label = TIP_CATEGORY_LABEL[tip.category];
  return (
    // Keyed by tip so a new day's tip plays the entrance again instead of swapping in place.
    <Reveal key={tip.id} index={1}>
      <View
        testID="tip-of-the-day"
        accessible
        accessibilityLabel={`Tip of the day, ${dayLabel(q.data.date)}. ${label}. ${tip.body}`}
        style={{
          ...raised,
          padding: spacing.lg,
          gap: spacing.sm,
          borderColor: colors.champagne,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: radii.control,
              backgroundColor: colors.page,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name={TIP_ICON[tip.category]} size={22} color={colors.champagne} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" style={{ color: colors.champagne }}>
              Tip of the Day
            </Text>
            <Text variant="caption" tone="muted">
              {dayLabel(q.data.date)} · {label}
            </Text>
          </View>
        </View>
        <Text>{tip.body}</Text>
        {tip.courseId ? (
          <Button
            label="Learn more"
            variant="secondary"
            accessibilityHint={`Opens the course ${tip.courseTitle ?? ""}`}
            onPress={() => router.push(`/course/${tip.courseId}` as never)}
          />
        ) : null}
        <View style={{ height: 1, backgroundColor: neutrals.divider }} />
        <Text variant="caption" tone="muted">
          Educational only. Not financial advice.
        </Text>
      </View>
    </Reveal>
  );
}
