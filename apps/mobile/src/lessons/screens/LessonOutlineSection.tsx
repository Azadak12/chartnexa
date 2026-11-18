import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { LessonOutlineItem } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../../api/errors";
import { shouldRetry } from "../../state/query-client";
import { StateView } from "../../state/StateView";
import { colors, MIN_TOUCH_SIZE, neutrals, radii, spacing } from "../../theme";
import { Button, BottomSheet, Skeleton, Text } from "../../ui";
import { lessonApi } from "../lesson-api";

/** The curriculum on the course page. It fails on its own: the rest of the page stays usable. */
export function LessonOutlineSection({
  courseId,
  enrolled = false,
}: {
  courseId: string;
  enrolled?: boolean;
}) {
  const router = useRouter();
  const [locked, setLocked] = useState<LessonOutlineItem | null>(null);
  const openerRef = useRef(null);
  const query = useQuery({
    queryKey: ["lessons", courseId, enrolled],
    queryFn: () => lessonApi.outline(courseId),
    retry: shouldRetry,
  });

  return (
    <View style={{ gap: spacing.md }} testID="lesson-outline">
      <Text variant="heading" accessibilityRole="header">
        Lessons
      </Text>
      {query.status === "pending" ? (
        <View style={{ gap: spacing.sm }} accessibilityLabel="Loading lessons">
          <Skeleton height={48} />
          <Skeleton height={48} />
        </View>
      ) : query.status === "error" ? (
        <StateView
          state={isAppError(query.error) && query.error.kind === "network" ? "offline" : "error"}
          message={isAppError(query.error) ? query.error.message : messageFor("unknown")}
          requestId={isAppError(query.error) ? query.error.requestId : null}
          onAction={() => void query.refetch()}
        />
      ) : query.data.items.length === 0 ? (
        <Text tone="muted" testID="lessons-empty">
          Lessons are coming.
        </Text>
      ) : (
        <View ref={openerRef} collapsable={false} style={{ gap: spacing.sm }}>
          {query.data.items.map((l) => (
            <Pressable
              key={l.id}
              testID={`lesson-${l.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Lesson ${l.position}: ${l.title}, ${l.isPreview ? "free preview" : enrolled ? "included" : "locked"}`}
              accessibilityHint={
                l.isPreview || enrolled ? "Opens the lesson" : "Explains how to unlock it"
              }
              onPress={() =>
                l.isPreview || enrolled
                  ? router.push(`/course/${courseId}/lesson/${l.id}`)
                  : setLocked(l)
              }
              style={styles.row}
            >
              <Text variant="bodyStrong" style={styles.number}>
                {l.position}
              </Text>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text variant="body">{l.title}</Text>
                <Text variant="caption" tone={l.isPreview || enrolled ? "link" : "muted"}>
                  {l.isPreview ? "Free preview" : enrolled ? "Included" : "Locked"}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      <BottomSheet
        visible={locked !== null}
        onDismiss={() => setLocked(null)}
        title="This lesson is locked"
        openerRef={openerRef}
      >
        <Text>
          {locked ? `"${locked.title}" ` : ""}is part of the full course. Enrollment is coming soon.
        </Text>
        <Button label="Close" variant="secondary" onPress={() => setLocked(null)} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: MIN_TOUCH_SIZE,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: neutrals.divider,
    backgroundColor: colors.white,
  },
  number: { minWidth: 24, textAlign: "center" },
});
