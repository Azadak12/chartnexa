import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import type { ProgressResponse } from "@chartnexa/api-contracts";
import { lessonApi } from "../lessons/lesson-api";
import { colors, radii, spacing } from "../theme";
import { Burst } from "../kit/Burst";
import { Button, Text, useReducedMotion } from "../ui";
import { shouldRetry } from "../state/query-client";
import { ProgressBar } from "./ProgressBar";

/** Completion is supplied by confirmed progress, including automatic video completion. */
export function LessonCompletionPanel({
  courseId,
  lessonId,
  progress,
}: {
  courseId: string;
  lessonId: string;
  progress: ProgressResponse;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  // The badge springs in once when the lesson is confirmed complete.
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced === null) return;
    if (reduced) pop.setValue(1);
    else
      Animated.spring(pop, {
        toValue: 1,
        friction: 4,
        tension: 120,
        useNativeDriver: true,
      }).start();
  }, [reduced, pop]);
  const outline = useQuery({
    queryKey: ["lessons", courseId, true],
    queryFn: () => lessonApi.outline(courseId),
    retry: shouldRetry,
  });
  const done = new Set(progress.lessons.map((l) => l.lessonId));
  // Derive from confirmed IDs so a mutation's temporarily stale nextLessonId cannot point here.
  const next = outline.data?.items.find((l) => !done.has(l.id) && l.id !== lessonId);
  const complete = progress.total > 0 && progress.completed >= progress.total;
  return (
    <View
      testID="lesson-completion-panel"
      style={{
        padding: spacing.lg,
        borderRadius: radii.card,
        backgroundColor: colors.blueTint,
        gap: spacing.md,
      }}
    >
      <Animated.View
        style={{
          width: 48,
          height: 48,
          borderRadius: radii.pill,
          backgroundColor: complete ? colors.gold : colors.blue,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
        }}
      >
        <Burst />
        <Feather
          name={complete ? "award" : "check"}
          size={24}
          color={colors.onBlue}
          accessible={false}
        />
      </Animated.View>
      <Text variant="heading" accessibilityRole="header">
        {complete ? "Course complete. Well done!" : "One step further."}
      </Text>
      <Text tone="muted">
        {complete
          ? "You've completed every lesson. Come back anytime to revisit what you've learned."
          : "Lesson complete. Keep building on what you've learned."}
      </Text>
      <ProgressBar completed={progress.completed} total={progress.total} />
      {!complete && next ? (
        <>
          <Text variant="caption" tone="link">
            UP NEXT
          </Text>
          <Text variant="bodyStrong">{next.title}</Text>
          <Button
            label="Continue to next lesson"
            onPress={() => router.replace(`/course/${courseId}/lesson/${next.id}`)}
          />
        </>
      ) : null}
      {outline.status === "error" && !complete ? (
        <Button
          label="Retry next lesson"
          variant="secondary"
          onPress={() => void outline.refetch()}
        />
      ) : null}
      <Button
        label="View my learning"
        variant="secondary"
        onPress={() => router.navigate("/courses")}
      />
    </View>
  );
}
