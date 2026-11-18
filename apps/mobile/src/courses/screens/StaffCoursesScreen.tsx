import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { isAppError, messageFor } from "../../api/errors";
import { StateView } from "../../state/StateView";
import { colors, neutrals, radii, spacing } from "../../theme";
import { Button, Chip, Screen, Text } from "../../ui";
import {
  canCreateCourses,
  canManageCategories,
  canManageCourses,
  fetchAccess,
  staffCourseApi,
} from "../course-api";
import { LEVEL_LABEL } from "../CourseCard";
import { formatPrice } from "../money";

type StatusFilter = "all" | "draft" | "published";

/** Staff see every course with its status as text. The server enforces who may open this. */
export function StaffCoursesScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("all");
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canManageCourses(access.data);
  const query = useInfiniteQuery({
    queryKey: ["staff-courses", status],
    enabled: allowed,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      staffCourseApi.list({
        ...(status !== "all" ? { status } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  if (access.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (access.status === "error") {
    return (
      <Screen>
        <StateView
          state="error"
          message={isAppError(access.error) ? access.error.message : messageFor("unknown")}
          onAction={() => void access.refetch()}
        />
      </Screen>
    );
  }
  if (!allowed) {
    return (
      <Screen>
        <StateView
          state="empty"
          title="You do not have access"
          message="Only staff can manage courses."
          actionLabel="Back"
          onAction={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
        />
      </Screen>
    );
  }

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <Text variant="title" accessibilityRole="header">
        Manage courses
      </Text>
      {canCreateCourses(access.data) ? (
        <Button label="New course" onPress={() => router.push("/manage/new")} />
      ) : null}
      {canManageCategories(access.data) ? (
        <Button
          label="Categories"
          variant="secondary"
          onPress={() => router.push("/manage/categories")}
        />
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {(["all", "draft", "published"] as const).map((s) => (
          <Chip
            key={s}
            label={s === "all" ? "All" : s === "draft" ? "Drafts" : "Published"}
            selected={status === s}
            onPress={() => setStatus(s)}
          />
        ))}
      </View>
    </View>
  );

  let empty: React.ReactElement | undefined;
  if (query.status === "pending") empty = <StateView state="loading" />;
  else if (query.status === "error") {
    empty = (
      <StateView
        state="error"
        message={isAppError(query.error) ? query.error.message : messageFor("unknown")}
        onAction={() => void query.refetch()}
      />
    );
  } else if (items.length === 0) {
    const fullAccess = (access.data?.permissions ?? []).includes("course:update");
    empty = (
      <StateView
        state="empty"
        title="No courses"
        message={
          status !== "all"
            ? "No courses with this status."
            : fullAccess
              ? "Create the first course."
              : "Courses you are given access to will appear here. An Admin or Manager can give you access."
        }
      />
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        testID="staff-course-list"
        data={items}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={{ padding: spacing.lg }}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.status === "draft" ? "Draft" : "Published"}, ${LEVEL_LABEL[item.level]}, ${formatPrice(item.priceCents)}`}
            onPress={() => router.push(`/manage/${item.id}`)}
            style={styles.row}
            testID={`staff-course-${item.id}`}
          >
            <Text variant="subheading">{item.title}</Text>
            <View style={styles.meta}>
              <Text
                variant="bodyStrong"
                tone={item.status === "published" ? "success" : "muted"}
                testID={`status-${item.id}`}
              >
                {item.status === "draft" ? "Draft" : "Published"}
              </Text>
              <Text variant="caption" tone="muted">
                {LEVEL_LABEL[item.level]} · {formatPrice(item.priceCents)}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: neutrals.divider,
    padding: spacing.lg,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
});
