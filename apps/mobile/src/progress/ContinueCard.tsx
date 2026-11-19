import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Button, Card, Text } from "../ui";
import { continueApi } from "./continue-api";
import { ProgressBar } from "./ProgressBar";

/**
 * "Continue learning" on home: the unfinished course studied most recently and its next lesson.
 * A shortcut only, so it shows nothing while loading, on error, or when there is nothing to resume.
 */
export function ContinueCard() {
  const router = useRouter();
  // Fresh on every visit: finishing a lesson should move the card on.
  const q = useQuery({ queryKey: ["continue-learning"], queryFn: continueApi.get, staleTime: 0 });
  const item = q.data;
  if (!item) return null;
  return (
    <Card testID="continue-learning">
      <Text variant="caption" tone="muted">
        Continue learning
      </Text>
      <Text variant="subheading">{item.courseTitle}</Text>
      <ProgressBar completed={item.completed} total={item.total} testID="continue-progress" />
      <Text>Next: {item.nextLessonTitle}</Text>
      <Button
        label="Continue"
        accessibilityLabel={`Continue ${item.courseTitle} with ${item.nextLessonTitle}`}
        onPress={() => router.push(`/course/${item.courseId}/lesson/${item.nextLessonId}`)}
      />
    </Card>
  );
}
