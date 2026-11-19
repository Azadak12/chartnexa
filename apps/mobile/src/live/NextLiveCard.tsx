import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { spacing } from "../theme";
import { Banner, Button } from "../ui";
import { liveApi } from "./live-api";
import { LiveSessionRow } from "./LiveSessionRow";
import { useJoinLive } from "./use-join";

/**
 * The soonest live class across the person's courses, on the home screen. It is a shortcut, so
 * it stays out of the way: nothing shows while loading, on error, or when nothing is scheduled.
 */
export function NextLiveCard() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["live", "mine"],
    queryFn: liveApi.mine,
    refetchInterval: 60_000,
  });
  const { join, busy, message } = useJoinLive(liveApi.join);
  const next = query.data?.find((s) => s.state !== "cancelled");
  if (!next) return null;
  return (
    <View style={{ gap: spacing.sm }} testID="next-live">
      {message ? <Banner kind="error" message={message} /> : null}
      <LiveSessionRow
        session={next}
        showCourse
        joining={busy === next.id}
        onJoin={() => void join(next)}
      />
      <Button
        label="Open course"
        variant="tertiary"
        accessibilityLabel={`Open ${next.courseTitle}`}
        onPress={() => router.push(`/course/${next.courseId}`)}
      />
    </View>
  );
}
