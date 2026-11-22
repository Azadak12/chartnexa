import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import type { LeaderboardEntry } from "@chartnexa/api-contracts";
import { colors, neutrals, radii, spacing } from "../theme";
import { Text, useReducedMotion } from "../ui";

/** Initials stand in for photos: no avatar images exist, and a name is all that is public. */
export const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("") || "?";

/** Podium step heights by rank (ties share a height); 1st is tallest. */
const HEIGHT: Record<number, number> = { 1: 120, 2: 92, 3: 72 };
const TIER: Record<number, string> = { 1: colors.champagne, 2: colors.link, 3: neutrals.muted };
export const lessonsText = (n: number) => `${n} ${n === 1 ? "lesson" : "lessons"}`;

function Step({ entry }: { entry: LeaderboardEntry }) {
  const reduced = useReducedMotion();
  const target = HEIGHT[Math.min(entry.rank, 3)] ?? 72;
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced === null) return;
    if (reduced) {
      grow.setValue(1);
      return;
    }
    Animated.timing(grow, { toValue: 1, duration: 600, useNativeDriver: false }).start();
  }, [reduced, grow, entry.rank]);
  const tier = TIER[Math.min(entry.rank, 3)] ?? neutrals.muted;
  const height = grow.interpolate({ inputRange: [0, 1], outputRange: [8, target] });
  return (
    <View
      testID={`podium-${entry.rank}-${entry.displayName}`}
      accessible
      accessibilityLabel={`Rank ${entry.rank}, ${entry.isMe ? "you, " : ""}${entry.displayName}, ${lessonsText(entry.completedLessons)} completed`}
      style={styles.column}
    >
      <View style={[styles.avatar, { borderColor: tier }]}>
        <Text variant="bodyStrong">{initials(entry.displayName)}</Text>
      </View>
      <Text variant="caption" numberOfLines={1} style={styles.name}>
        {entry.isMe ? "You" : entry.displayName}
      </Text>
      <Animated.View style={[styles.step, { height, borderTopColor: tier }]}>
        <Text variant="heading" style={{ color: tier }}>
          {entry.rank}
        </Text>
        <Text variant="caption" tone="muted">
          {lessonsText(entry.completedLessons)}
        </Text>
      </Animated.View>
    </View>
  );
}

/**
 * The top three as a podium: second, first, third from left to right. Heights follow the rank
 * and rise once (not with Reduced Motion). Each step is one labelled element, so a screen reader
 * hears rank, name and lessons without the animation.
 */
export function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const top = entries.slice(0, 3);
  if (top.length === 0) return null;
  const order = [top[1], top[0], top[2]].filter((e): e is LeaderboardEntry => !!e);
  return (
    <View testID="podium" style={styles.row}>
      {order.map((e) => (
        <Step key={`${e.rank}-${e.displayName}`} entry={e} />
      ))}
    </View>
  );
}

const styles = {
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingTop: spacing.md },
  column: { flex: 1, alignItems: "center", gap: spacing.xs, minWidth: 0 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { maxWidth: "100%" },
  step: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 3,
    borderTopLeftRadius: radii.control,
    borderTopRightRadius: radii.control,
    backgroundColor: neutrals.surface,
  },
} as const;
