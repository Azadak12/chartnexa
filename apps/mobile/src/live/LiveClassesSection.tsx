import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { isAppError } from "../api/errors";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { spacing } from "../theme";
import { Banner, Text } from "../ui";
import { liveApi } from "./live-api";
import { LiveSessionRow } from "./LiveSessionRow";
import { useJoinLive } from "./use-join";

/** A minute is enough for states (open, live, ended) to move on while the page is open. */
const REFRESH_MS = 60_000;

/** The course's live classes for people who own it. Nothing shows when there are none. */
export function LiveClassesSection({ courseId }: { courseId: string }) {
  const query = useQuery({
    queryKey: ["live", "course", courseId],
    queryFn: () => liveApi.forCourse(courseId),
    retry: shouldRetry,
    refetchInterval: REFRESH_MS,
  });
  const { join, busy, message } = useJoinLive(liveApi.join);

  if (query.status === "pending") {
    return (
      <Text tone="muted" accessibilityLabel="Loading live classes">
        Loading live classes…
      </Text>
    );
  }
  if (query.status === "error") {
    if (isAppError(query.error) && query.error.kind === "forbidden") return null;
    return (
      <StateView
        state={isAppError(query.error) && query.error.kind === "network" ? "offline" : "error"}
        message="Live classes could not be loaded."
        onAction={() => void query.refetch()}
      />
    );
  }
  if (query.data.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }} testID="live-classes">
      <Text variant="subheading" accessibilityRole="header">
        Live classes
      </Text>
      <Text variant="caption" tone="muted">
        Times are shown in your time zone.
      </Text>
      {message ? <Banner kind="error" message={message} testID="live-error" /> : null}
      {query.data.map((s) => (
        <LiveSessionRow
          key={s.id}
          session={s}
          joining={busy === s.id}
          onJoin={() => void join(s)}
        />
      ))}
    </View>
  );
}
