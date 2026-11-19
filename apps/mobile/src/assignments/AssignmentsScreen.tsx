import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { isAppError, messageFor } from "../api/errors";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { AssignmentCard } from "../kit/AssignmentCard";
import { spacing } from "../theme";
import { Screen, Text } from "../ui";
import { assignmentApi, STATE_TEXT } from "./assignment-api";

const dueText = (iso: string | null) =>
  iso
    ? `Due ${new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
    : "No due date";

const SECTIONS = [
  { key: "todo", title: "To do", states: ["to_do"] },
  { key: "submitted", title: "Submitted", states: ["submitted", "late"] },
  { key: "reviewed", title: "Reviewed", states: ["reviewed"] },
] as const;

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
        SECTIONS.map((sec) => {
          const rows = q.data.filter((a) => (sec.states as readonly string[]).includes(a.state));
          if (rows.length === 0) return null;
          return (
            <View key={sec.title} style={{ gap: spacing.sm }} testID={`section-${sec.key}`}>
              <Text variant="heading" accessibilityRole="header">
                {sec.title} ({rows.length})
              </Text>
              {rows.map((a) => (
                <AssignmentCard
                  key={a.id}
                  testID={`assignment-${a.id}`}
                  title={a.title}
                  courseTitle={a.courseTitle}
                  stateText={STATE_TEXT[a.state]}
                  stateTone={
                    a.state === "to_do" ? "link" : a.state === "reviewed" ? "success" : "muted"
                  }
                  dueText={dueText(a.dueAt)}
                  overdue={a.overdue}
                  onPress={() => router.push(`/assignment/${a.id}`)}
                />
              ))}
            </View>
          );
        })
      )}
    </Screen>
  );
}
