import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { isAppError, messageFor } from "../../api/errors";
import { ProgressBar, progressLabel } from "../../progress/ProgressBar";
import { LEVEL_LABEL } from "../../courses/CourseCard";
import { CoverBlock } from "../../courses/CoverBlock";
import { useRestorableScroll } from "../../navigation/screen-memory";
import { StateView } from "../../state/StateView";
import { colors, neutrals, radii, spacing } from "../../theme";
import { Screen, Skeleton, Text } from "../../ui";
import { myCoursesApi } from "../entitlement-api";

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
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  const header = (
    <Text variant="title" accessibilityRole="header" style={{ paddingBottom: spacing.md }}>
      My Courses
    </Text>
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
        ListFooterComponent={query.isFetchingNextPage ? <Skeleton height={80} /> : undefined}
        contentContainerStyle={{ padding: spacing.lg }}
        {...scroll.props}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${LEVEL_LABEL[item.level]}${item.onSale ? "" : ", not currently on sale"}, ${progressLabel(item.progress.completed, item.progress.total)}`}
            onPress={() => router.push(`/course/${item.id}`)}
            style={styles.card}
            testID={`my-course-${item.id}`}
          >
            <CoverBlock tone={item.coverTone} thumbnailUrl={item.thumbnailUrl} />
            <View style={{ gap: spacing.xs }}>
              <Text variant="subheading">{item.title}</Text>
              <Text variant="caption" tone="muted">
                {LEVEL_LABEL[item.level]}
              </Text>
              <ProgressBar
                completed={item.progress.completed}
                total={item.progress.total}
                testID={`progress-${item.id}`}
              />
              {item.onSale ? null : (
                <Text variant="caption" tone="warning" testID={`not-on-sale-${item.id}`}>
                  Not currently on sale
                </Text>
              )}
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: neutrals.divider,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
});
