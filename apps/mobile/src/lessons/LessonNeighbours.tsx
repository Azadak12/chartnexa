import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { shouldRetry } from "../state/query-client";
import { spacing } from "../theme";
import { Button } from "../ui";
import { lessonApi } from "./lesson-api";

/**
 * Previous and next lesson in course order. A lesson the person cannot open (locked) is never
 * offered, and the row stays out of the way until the outline has loaded.
 */
export function LessonNeighbours({
  courseId,
  lessonId,
  enrolled,
  onOpen,
}: {
  courseId: string;
  lessonId: string;
  enrolled: boolean;
  onOpen: (lessonId: string) => void;
}) {
  const outline = useQuery({
    queryKey: ["lessons", courseId, enrolled],
    queryFn: () => lessonApi.outline(courseId),
    retry: shouldRetry,
  });
  const items = outline.data?.items ?? [];
  const i = items.findIndex((x) => x.id === lessonId);
  if (i < 0) return null;
  const open = (x: { isPreview: boolean } | undefined) => !!x && (enrolled || x.isPreview);
  const prev = open(items[i - 1]) ? items[i - 1] : undefined;
  const next = open(items[i + 1]) ? items[i + 1] : undefined;
  if (!prev && !next) return null;
  return (
    <View style={{ flexDirection: "row", gap: spacing.md }} testID="lesson-neighbours">
      <View style={{ flex: 1 }}>
        {prev ? (
          <Button
            label="Previous lesson"
            variant="secondary"
            accessibilityHint={prev.title}
            onPress={() => onOpen(prev.id)}
          />
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        {next ? (
          <Button
            label="Next lesson"
            accessibilityHint={next.title}
            onPress={() => onOpen(next.id)}
          />
        ) : null}
      </View>
    </View>
  );
}
