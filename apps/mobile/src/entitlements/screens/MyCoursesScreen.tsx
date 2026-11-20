import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import type { MyCourse } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../../api/errors";
import { ProgressBar, progressLabel } from "../../progress/ProgressBar";
import { LEVEL_LABEL } from "../../courses/CourseCard";
import { CourseThumbnail } from "../../kit/CourseThumbnail";
import { useScreenMemoryState, useRestorableScroll } from "../../navigation/screen-memory";
import { StateView } from "../../state/StateView";
import { colors, neutrals, radii, spacing } from "../../theme";
import { Button, Chip, Screen, Skeleton, Text } from "../../ui";
import { ResumeLearning } from "../../progress/ResumeLearning";
import { CourseLearningAction } from "../../progress/CourseLearningAction";
import { ProgressRing } from "../../kit/ProgressRing";
import { myCoursesApi } from "../entitlement-api";

type Filter = "all" | "in_progress" | "completed";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];
const isDone = (c: MyCourse) => c.progress.total > 0 && c.progress.completed >= c.progress.total;
const stateOf = (c: MyCourse) =>
  isDone(c) ? "Completed" : c.progress.completed > 0 ? "In progress" : "Not started";

/** The courses the signed-in person owns. Unpublished ones stay, marked as not on sale. */
export function MyCoursesScreen() {
  const router = useRouter();
  const scroll = useRestorableScroll("my-courses:list");
  const query = useInfiniteQuery({
    queryKey: ["my-courses"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => myCoursesApi.list(pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const [filter, setFilter] = useScreenMemoryState<Filter>("my-courses:filter", "all");
  const all = query.data?.pages.flatMap((p) => p.items) ?? [];
  const items = all.filter((c) =>
    filter === "all" ? true : filter === "completed" ? isDone(c) : !isDone(c),
  );
  const lessonsDone = all.reduce((n, c) => n + c.progress.completed, 0);
  const lessonsTotal = all.reduce((n, c) => n + c.progress.total, 0);
  const completedCourses = all.filter(isDone).length;

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <Text variant="title" accessibilityRole="header">
        My Learning
      </Text>
      <Text tone="muted">Small steps. Lasting knowledge.</Text>
      <ResumeLearning journey />
      {all.length > 0 ? (
        <>
          <View
            testID="learning-summary"
            accessible
            accessibilityLabel={`${all.length} ${all.length === 1 ? "course" : "courses"}, ${completedCourses} completed, ${lessonsDone} of ${lessonsTotal} lessons done${query.hasNextPage ? " so far" : ""}`}
            style={styles.summary}
          >
            <ProgressRing completed={lessonsDone} total={lessonsTotal} size={64} stroke={6} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text variant="caption" tone="muted">
                Your progress
              </Text>
              <Text variant="heading">
                {lessonsDone} of {lessonsTotal} lessons done
              </Text>
              <Text variant="caption" tone="muted">
                {completedCourses} of {all.length} {all.length === 1 ? "course" : "courses"}{" "}
                completed
                {query.hasNextPage ? " (loaded so far)" : ""}
              </Text>
            </View>
          </View>
          <Text variant="heading" accessibilityRole="header">
            Your courses
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <Chip
                key={f.key}
                label={f.label}
                selected={filter === f.key}
                onPress={() => setFilter(f.key)}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );

  let empty: React.ReactElement | undefined;
  if (query.status === "pending") empty = <StateView state="loading" />;
  else if (query.status === "error") {
    const e = query.error;
    empty = (
      <StateView
        state={isAppError(e) && e.kind === "network" ? "offline" : "error"}
        message={isAppError(e) ? e.message : messageFor("unknown")}
        requestId={isAppError(e) ? e.requestId : null}
        onAction={() => void query.refetch()}
      />
    );
  } else if (all.length > 0 && items.length === 0) {
    empty = (
      <StateView
        state="empty"
        title={filter === "completed" ? "Nothing completed yet" : "Nothing in progress"}
        message={
          filter === "completed"
            ? "Finish every lesson in a course and it will show up here."
            : "Every course you own is complete."
        }
        actionLabel="Show all courses"
        onAction={() => setFilter("all")}
      />
    );
  } else if (items.length === 0) {
    empty = (
      <StateView
        state="empty"
        title="You have not enrolled in any courses yet"
        message="Courses you have access to will appear here."
        actionLabel="Browse courses"
        onAction={() => router.push("/explore")}
      />
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        ref={scroll.ref as never}
        testID="my-courses-list"
        data={items}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <Skeleton height={80} />
          ) : query.isFetchNextPageError ? (
            <Button
              label="Retry more courses"
              variant="secondary"
              onPress={() => void query.fetchNextPage()}
            />
          ) : undefined
        }
        contentContainerStyle={{ padding: spacing.lg }}
        {...scroll.props}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError)
            void query.fetchNextPage();
        }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${LEVEL_LABEL[item.level]}${item.onSale ? "" : ", not currently on sale"}, ${progressLabel(item.progress.completed, item.progress.total)}`}
              onPress={() => router.push(`/course/${item.id}`)}
              testID={`my-course-${item.id}`}
            >
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <CourseThumbnail
                  tone={item.coverTone}
                  thumbnailUrl={item.thumbnailUrl}
                  width={104}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {LEVEL_LABEL[item.level]} · {stateOf(item)}
                  </Text>
                  {item.onSale ? null : (
                    <Text variant="caption" tone="warning" testID={`not-on-sale-${item.id}`}>
                      Not currently on sale
                    </Text>
                  )}
                </View>
              </View>
            </Pressable>
            <ProgressBar
              completed={item.progress.completed}
              total={item.progress.total}
              testID={`progress-${item.id}`}
            />
            <CourseLearningAction
              courseId={item.id}
              completed={item.progress.completed}
              total={item.progress.total}
            />
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: {
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.card,
    backgroundColor: neutrals.surface,
    borderWidth: 1,
    borderColor: neutrals.divider,
    gap: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: neutrals.divider,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
});
