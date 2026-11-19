import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { isAppError, messageFor } from "../api/errors";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { colors, neutrals, radii, spacing, status as statusColors } from "../theme";
import { Screen, Text } from "../ui";
import { assignmentApi, STATE_TEXT } from "./assignment-api";

const dueText = (iso: string | null) =>
  iso
    ? `Due ${new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
    : "No due date";

/** The student's coursework: what is still to do first, then what is handed in or reviewed. */
export function AssignmentsScreen() {
  const router = useRouter();
  const q = useQuery({
    queryKey: ["assignments"],
    queryFn: assignmentApi.list,
    retry: shouldRetry,
    staleTime: 0,
  });
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Assignments
      </Text>
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
          message="When an instructor gives you coursework, it appears here."
        />
      ) : (
        q.data.map((a) => (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            accessibilityLabel={`${a.title}, ${a.courseTitle}, ${STATE_TEXT[a.state]}${a.overdue ? ", overdue" : ""}. ${dueText(a.dueAt)}`}
            onPress={() => router.push(`/assignment/${a.id}`)}
            testID={`assignment-${a.id}`}
            style={{
              borderWidth: 1,
              borderColor: a.overdue ? statusColors.error : neutrals.divider,
              borderRadius: radii.card,
              padding: spacing.md,
              gap: spacing.xs,
              backgroundColor: colors.white,
            }}
          >
            <Text variant="caption" tone="muted">
              {a.courseTitle}
            </Text>
            <Text variant="subheading">{a.title}</Text>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}
            >
              <Text variant="caption" tone={a.overdue ? "error" : "muted"}>
                {a.overdue ? "Overdue · " : ""}
                {dueText(a.dueAt)}
              </Text>
              <Text
                variant="caption"
                tone={a.state === "to_do" ? "link" : a.state === "reviewed" ? "success" : "muted"}
              >
                {STATE_TEXT[a.state]}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </Screen>
  );
}
