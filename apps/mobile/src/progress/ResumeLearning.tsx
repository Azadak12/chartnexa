import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, market, neutrals, radii, spacing } from "../theme";
import { Button, Skeleton, Text } from "../ui";
import { shouldRetry } from "../state/query-client";
import { continueApi } from "./continue-api";
import { LearningJourney } from "./LearningJourney";

/** One clear next action, shared by Home and the student's library. */
export function ResumeLearning({ journey = false }: { journey?: boolean }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    queryKey: ["continue-learning"],
    queryFn: continueApi.get,
    staleTime: 0,
    retry: shouldRetry,
  });
  if (query.status === "pending") return <Skeleton height={220} />;
  if (query.status === "error")
    return (
      <View style={styles.empty}>
        <Text variant="bodyStrong">Your next lesson could not be loaded.</Text>
        <Button
          label="Retry continue learning"
          variant="secondary"
          onPress={() => void query.refetch()}
        />
      </View>
    );
  const r = query.data;
  if (!r)
    return journey ? null : (
      <View style={styles.empty} testID="learning-discovery">
        <Feather name="compass" size={28} color={colors.blue} accessible={false} />
        <Text variant="heading">Start your next course.</Text>
        <Text tone="muted">Pick a topic, find a course, and learn at your own speed.</Text>
        <Button label="Explore courses" onPress={() => router.push("/explore")} />
      </View>
    );
  const percent = Math.min(100, Math.round((r.completed / Math.max(1, r.total)) * 100));
  return (
    <View style={{ gap: spacing.md }} testID="continue-learning">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Continue ${r.courseTitle}: ${r.nextLessonTitle}. ${percent} percent complete`}
        onPress={() => router.push(`/course/${r.courseId}/lesson/${r.nextLessonId}`)}
        style={({ pressed }) => [styles.hero, { opacity: pressed ? 0.9 : 1 }]}
      >
        <View style={styles.topline}>
          <View style={styles.badge}>
            <Feather name="play" size={14} color={colors.onBlue} accessible={false} />
            <Text variant="caption" tone="onBlue">
              Continue learning
            </Text>
          </View>
          <Text variant="caption" style={{ color: market.onNavy }}>
            YOUR NEXT STEP
          </Text>
        </View>
        <Text variant="caption" style={{ color: market.onNavy }}>
          {r.courseTitle}
        </Text>
        <Text variant="title" tone="onNavy">
          {r.nextLessonTitle}
        </Text>
        <View style={{ gap: spacing.sm }}>
          <View style={styles.topline}>
            <Text variant="caption" style={{ color: market.onNavy }}>
              {r.completed} of {r.total} lessons complete
            </Text>
            <Text variant="bodyStrong" tone="onNavy">
              {percent}%
            </Text>
          </View>
          <View style={styles.track} testID="continue-progress">
            <View style={[styles.fill, { width: `${percent}%` }]} />
          </View>
        </View>
        <View style={styles.cta}>
          <Text variant="button" tone="onBlue">
            Continue lesson
          </Text>
          <Feather name="arrow-right" size={20} color={colors.onBlue} accessible={false} />
        </View>
      </Pressable>
      {journey ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your learning path"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded(!expanded)}
            style={styles.pathToggle}
          >
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Your learning path</Text>
              <Text variant="caption" tone="muted">
                See how each lesson fits together
              </Text>
            </View>
            <Feather
              name={expanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={colors.blue}
              accessible={false}
            />
          </Pressable>
          {expanded ? <LearningJourney key={r.courseId} courseId={r.courseId} /> : null}
        </>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  hero: {
    backgroundColor: market.navy,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: "hidden",
  },
  topline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.blue,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  track: { height: 6, borderRadius: radii.pill, backgroundColor: market.grid, overflow: "hidden" },
  fill: { height: 6, backgroundColor: market.blueOnNavy },
  cta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.control,
    backgroundColor: colors.blue,
    padding: spacing.md,
    minHeight: 48,
  },
  empty: {
    backgroundColor: colors.blueTint,
    padding: spacing.lg,
    borderRadius: radii.card,
    gap: spacing.md,
  },
  pathToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: neutrals.divider,
    minHeight: 56,
  },
});
