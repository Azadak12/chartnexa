import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { CourseModule, LessonOutlineItem } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../../api/errors";
import { shouldRetry } from "../../state/query-client";
import { StateView } from "../../state/StateView";
import { LessonCard, ModuleAccordion } from "../../kit/ModuleAccordion";
import { colors, neutrals, radii, spacing } from "../../theme";
import { Button, BottomSheet, Skeleton, Text } from "../../ui";
import { progressApi } from "../../progress/progress-api";
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

  const progress = useQuery({
    queryKey: ["progress", courseId],
    enabled: enrolled,
    queryFn: () => progressApi.read(courseId),
    retry: shouldRetry,
  });
  const completedIds = new Set(progress.data?.lessons.map((l) => l.lessonId) ?? []);

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
          {groups(query.data.items, query.data.modules ?? []).map((g) => {
            const rows = g.items.map((l) => {
              const done = enrolled && completedIds.has(l.id);
              const open = l.isPreview || enrolled;
              const word = l.isPreview ? "free preview" : enrolled ? "included" : "locked";
              return (
                <LessonCard
                  key={l.id}
                  testID={`lesson-${l.id}`}
                  statusTestID={`completed-${l.id}`}
                  title={l.title}
                  position={l.position}
                  state={done ? "done" : l.isPreview ? "preview" : enrolled ? "open" : "locked"}
                  statusText={
                    done
                      ? "✓ Completed"
                      : l.isPreview
                        ? "Free preview"
                        : enrolled
                          ? "Included"
                          : "Locked"
                  }
                  label={`Lesson ${l.position}: ${l.title}, ${word}${done ? ", completed" : ""}`}
                  hint={open ? "Opens the lesson" : "Explains how to unlock it"}
                  onPress={() =>
                    open ? router.push(`/course/${courseId}/lesson/${l.id}`) : setLocked(l)
                  }
                />
              );
            });
            return g.module ? (
              <ModuleAccordion
                key={g.module.id}
                testID={`module-${g.module.id}`}
                title={`Module ${g.module.position}: ${g.module.title}`}
                summary={`${g.items.length} ${g.items.length === 1 ? "lesson" : "lessons"}`}
                defaultOpen
              >
                {rows}
              </ModuleAccordion>
            ) : (
              <View key="ungrouped" style={styles.plain}>
                {rows}
              </View>
            );
          })}
        </View>
      )}
      <BottomSheet
        visible={locked !== null}
        onDismiss={() => setLocked(null)}
        title="This lesson is locked"
        openerRef={openerRef}
      >
        <Text>
          {locked ? `"${locked.title}" ` : ""}is part of the full course. Buy the course on this
          page to unlock it.
        </Text>
        <Button label="Close" variant="secondary" onPress={() => setLocked(null)} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  plain: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: neutrals.divider,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
});

type Group = { module: CourseModule | null; items: LessonOutlineItem[] };
/** Consecutive lessons of one module form a group; lessons without a module stay together. */
function groups(items: LessonOutlineItem[], modules: CourseModule[]): Group[] {
  const out: Group[] = [];
  for (const l of items) {
    const mod = l.moduleId ? (modules.find((m) => m.id === l.moduleId) ?? null) : null;
    const last = out[out.length - 1];
    if (last && (last.module?.id ?? null) === (mod?.id ?? null)) last.items.push(l);
    else out.push({ module: mod, items: [l] });
  }
  return out;
}
