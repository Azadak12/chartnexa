import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { isAppError, messageFor } from "../../api/errors";
import { StateView } from "../../state/StateView";
import { courseShortcuts } from "../course-shortcuts";
import { CourseManageCard } from "../../kit/CourseManageCard";
import { Reveal } from "../../kit/Reveal";
import { SegmentedControl } from "../../kit/SegmentedControl";
import { CourseCardSkeleton, StudioEmpty } from "../../kit/StudioEmpty";
import { StudioHeader } from "../../kit/StudioHeader";
import { spacing } from "../../theme";
import { Button, Screen } from "../../ui";
import {
  canCreateCourses,
  canManageCategories,
  canManageCourses,
  fetchAccess,
  staffCourseApi,
} from "../course-api";

type StatusFilter = "all" | "draft" | "published";
const FILTERS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "published", label: "Published" },
] as const;
const asFilter = (v: unknown): StatusFilter => (v === "draft" || v === "published" ? v : "all");

/** Staff see every course with its status as text. The server enforces who may open this. */
export function StaffCoursesScreen() {
  const router = useRouter();
  // The dashboard's numbers open this list already filtered (?status=draft or published).
  const { status: initial } = useLocalSearchParams<{ status?: string }>();
  const [status, setStatus] = useState<StatusFilter>(asFilter(initial));
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
    // Keep the list on screen while the next filter loads, so switching does not flash.
    placeholderData: keepPreviousData,
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

  const canCreate = canCreateCourses(access.data);
  const header = (
    <View style={{ gap: spacing.lg, paddingBottom: spacing.md }}>
      <Reveal index={0}>
        <StudioHeader
          testID="manage-header"
          title="Manage Courses"
          subtitle="Create, edit and publish the courses you teach."
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {canCreate ? (
              <View style={{ flexGrow: 1, flexBasis: 140, minWidth: 0 }}>
                <Button label="New course" onPress={() => router.push("/manage/new")} />
              </View>
            ) : null}
            {canManageCategories(access.data) ? (
              <View style={{ flexGrow: 1, flexBasis: 140, minWidth: 0 }}>
                <Button
                  label="Categories"
                  variant="secondary"
                  onPress={() => router.push("/manage/categories")}
                />
              </View>
            ) : null}
          </View>
        </StudioHeader>
      </Reveal>
      <Reveal index={1}>
        <SegmentedControl
          testID="status-filter"
          options={FILTERS}
          value={status}
          onChange={setStatus}
        />
      </Reveal>
    </View>
  );

  let empty: React.ReactElement | undefined;
  if (query.status === "pending") {
    empty = (
      <View style={{ gap: spacing.sm }}>
        <CourseCardSkeleton />
        <CourseCardSkeleton />
        <CourseCardSkeleton />
      </View>
    );
  } else if (query.status === "error") {
    empty = (
      <StudioEmpty
        icon="wifi-off"
        title="Courses could not be loaded"
        message={isAppError(query.error) ? query.error.message : messageFor("unknown")}
        actionLabel="Retry"
        onAction={() => void query.refetch()}
        testID="state-error"
      />
    );
  } else if (items.length === 0) {
    const fullAccess = (access.data?.permissions ?? []).includes("course:update");
    empty = (
      <StudioEmpty
        title="No courses"
        message={
          status !== "all"
            ? status === "draft"
              ? "No drafts. Every course you have is published."
              : "Nothing is published yet. Publish a draft when it is ready."
            : fullAccess
              ? "Create the first course."
              : "Courses you are given access to will appear here. An Admin or Manager can give you access."
        }
        actionLabel={status === "all" && canCreate ? "New course" : undefined}
        onAction={status === "all" && canCreate ? () => router.push("/manage/new") : undefined}
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
        // While the next filter loads, the old list stays (dimmed) instead of flashing blank.
        style={{ opacity: query.isPlaceholderData ? 0.55 : 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        initialNumToRender={8}
        windowSize={7}
        renderItem={({ item }) => (
          <CourseManageCard
            course={item}
            onPress={() => router.push(`/manage/${item.id}`)}
            actions={courseShortcuts(access.data, item.id, (p) => router.push(p as never))}
          />
        )}
      />
    </Screen>
  );
}
