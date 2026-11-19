import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { isAppError, messageFor } from "../api/errors";
import { canManageAssignments, fetchAccess } from "../courses/course-api";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { neutrals, radii, spacing } from "../theme";
import { Button, Screen, Text } from "../ui";
import { staffAssignmentApi } from "./assignment-api";

const due = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "No due date";

/** A course's assignments for staff: status, due date and how many are handed in. */
export function StaffAssignmentsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseId = String(id);
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  const allowed = canManageAssignments(access.data, courseId);
  const q = useQuery({
    queryKey: ["staff-assignments", courseId],
    queryFn: () => staffAssignmentApi.list(courseId),
    enabled: allowed,
    retry: shouldRetry,
    staleTime: 0,
  });
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/manage/${courseId}`));

  if (access.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (access.status === "error" || !allowed) {
    return (
      <Screen>
        {access.status === "error" ? (
          <StateView
            state="error"
            message={isAppError(access.error) ? access.error.message : messageFor("unknown")}
            onAction={() => void access.refetch()}
          />
        ) : (
          <StateView
            state="empty"
            title="You do not have access"
            message="You need permission to manage assignments for this course."
            actionLabel="Back"
            onAction={back}
          />
        )}
      </Screen>
    );
  }
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Assignments
      </Text>
      <Button
        label="New assignment"
        onPress={() => router.push(`/manage/${courseId}/assignments/new`)}
      />
      {q.status === "pending" ? (
        <StateView state="loading" />
      ) : q.status === "error" ? (
        <StateView
          state={isAppError(q.error) && q.error.kind === "network" ? "offline" : "error"}
          message={isAppError(q.error) ? q.error.message : messageFor("unknown")}
          onAction={() => void q.refetch()}
        />
      ) : q.data.length === 0 ? (
        <StateView
          state="empty"
          title="No assignments yet"
          message="Create one, publish it, then assign it to your students."
        />
      ) : (
        q.data.map((a) => (
          <View
            key={a.id}
            testID={`staff-assignment-${a.id}`}
            style={{
              borderWidth: 1,
              borderColor: neutrals.divider,
              borderRadius: radii.card,
              padding: spacing.md,
              gap: spacing.xs,
            }}
          >
            <Text variant="subheading">{a.title}</Text>
            <Text variant="caption" tone={a.status === "draft" ? "muted" : "link"}>
              {a.status === "draft" ? "Draft" : "Published"} · {due(a.dueAt)}
            </Text>
            <Text variant="caption" tone="muted">
              {a.assignedCount} assigned · {a.submittedCount} handed in · {a.reviewedCount} reviewed
            </Text>
            <Button
              label="Open"
              variant="secondary"
              accessibilityLabel={`Open ${a.title}`}
              onPress={() => router.push(`/manage/${courseId}/assignments/${a.id}`)}
            />
          </View>
        ))
      )}
      <Button label="Back" variant="tertiary" onPress={back} />
    </Screen>
  );
}
