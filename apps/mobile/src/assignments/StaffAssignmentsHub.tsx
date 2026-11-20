import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { isAppError, messageFor } from "../api/errors";
import { canManageAssignments, fetchAccess, staffCourseApi } from "../courses/course-api";
import { CourseThumbnail } from "../kit/CourseThumbnail";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { colors, neutrals, radii, spacing } from "../theme";
import { Screen, Text } from "../ui";

/**
 * The Instructor's Assignments tab: the courses whose coursework they can manage. Assignments
 * belong to a course, so each course opens its own list. Nothing is shown for courses the person
 * may not manage; the server checks again on every request.
 */
export function StaffAssignmentsHub() {
  const router = useRouter();
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const courses = useQuery({
    queryKey: ["staff-courses", "hub"],
    queryFn: () => staffCourseApi.list({}),
    enabled: access.status === "success",
    retry: shouldRetry,
  });
  const failed = access.status === "error" ? access.error : courses.error;
  const rows = (courses.data?.items ?? []).filter((c) => canManageAssignments(access.data, c.id));
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Assignments
      </Text>
      <Text tone="muted">Choose a course to create, review and grade its assignments.</Text>
      {access.status === "pending" || (access.status === "success" && courses.isPending) ? (
        <StateView state="loading" />
      ) : failed ? (
        <StateView
          state={isAppError(failed) && failed.kind === "network" ? "offline" : "error"}
          message={isAppError(failed) ? failed.message : messageFor("unknown")}
          onAction={() => {
            void access.refetch();
            void courses.refetch();
          }}
        />
      ) : rows.length === 0 ? (
        <StateView
          state="empty"
          title="No courses with assignments to manage"
          message="Courses you can manage assignments for will appear here."
        />
      ) : (
        rows.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={`${c.title}, ${c.status === "published" ? "published" : "draft"}. Open assignments`}
            testID={`hub-course-${c.id}`}
            onPress={() => router.push(`/manage/${c.id}/assignments`)}
            style={({ pressed }) => ({
              flexDirection: "row",
              gap: spacing.md,
              alignItems: "center",
              padding: spacing.md,
              borderRadius: radii.card,
              borderWidth: 1,
              borderColor: neutrals.divider,
              backgroundColor: pressed ? neutrals.surface : colors.surface,
            })}
          >
            <CourseThumbnail tone={c.coverTone} thumbnailUrl={c.thumbnailUrl ?? null} width={88} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={2}>
                {c.title}
              </Text>
              <Text variant="caption" tone="muted">
                {c.status === "published" ? "Published" : "Draft"}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </Screen>
  );
}
