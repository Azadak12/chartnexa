import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type { LeaderboardEntry, LeaderboardPeriod } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { myCoursesApi } from "../entitlements/entitlement-api";
import { BackButton } from "../kit/BackButton";
import { Reveal } from "../kit/Reveal";
import { SegmentedControl } from "../kit/SegmentedControl";
import { StudioEmpty } from "../kit/StudioEmpty";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { colors, neutrals, radii, raised, spacing } from "../theme";
import { Banner, Button, Chip, Screen, Text } from "../ui";
import { leaderboardApi } from "./leaderboard-api";
import { initials, lessonsText, Podium } from "./Podium";

const PERIODS = [
  { key: "weekly", label: "Week" },
  { key: "monthly", label: "Month" },
  { key: "all", label: "All time" },
] as const;
const PERIOD_WORD: Record<LeaderboardPeriod, string> = {
  weekly: "this week",
  monthly: "this month",
  all: "of all time",
};

function Row({ entry }: { entry: LeaderboardEntry }) {
  return (
    <View
      testID={`board-row-${entry.rank}-${entry.displayName}`}
      accessible
      accessibilityLabel={`Rank ${entry.rank}, ${entry.isMe ? "you, " : ""}${entry.displayName}, ${lessonsText(entry.completedLessons)} completed`}
      style={{
        ...raised,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        padding: spacing.md,
        borderColor: entry.isMe ? colors.blue : neutrals.divider,
        borderWidth: entry.isMe ? 2 : 1,
      }}
    >
      <Text variant="bodyStrong" style={{ width: 32, textAlign: "center" }}>
        {entry.rank}
      </Text>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.page,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text variant="caption">{initials(entry.displayName)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {entry.displayName}
          {entry.isMe ? " (you)" : ""}
        </Text>
      </View>
      <Text variant="caption" tone="muted">
        {lessonsText(entry.completedLessons)}
      </Text>
    </View>
  );
}

/**
 * The Hall of Achievement: learners who chose to appear, ranked by verified lesson completions
 * for the week, the month or all time, optionally for one of the learner's own courses. Only
 * completed lessons count: no quiz results, failures or trading. Joining is a choice and can be
 * undone here at any time; only a display name is shown. Rows are text, so the screen reads the
 * same with or without animation.
 */
export function LeaderboardScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [period, setPeriod] = useState<LeaderboardPeriod>("weekly");
  const [courseId, setCourseId] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["leaderboard", period, courseId ?? null],
    queryFn: () => leaderboardApi.board(period, courseId),
    retry: shouldRetry,
    staleTime: 0,
  });
  const mine = useQuery({
    queryKey: ["my-courses", "leaderboard"],
    queryFn: () => myCoursesApi.list(),
  });
  const join = useMutation({
    mutationFn: (optedIn: boolean) => leaderboardApi.setOptIn(optedIn),
    onMutate: () => setMessage(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leaderboard"] }),
    onError: (e) =>
      setMessage(
        isAppError(e) && e.kind === "conflict"
          ? "Add a display name in your profile first, then join."
          : isAppError(e)
            ? e.message
            : messageFor("unknown"),
      ),
  });
  const back = () => (router.canGoBack() ? router.back() : router.replace("/home"));
  const courses = (mine.data?.items ?? []).filter((c) => c.onSale).slice(0, 8);
  const data = q.data;
  const rest = data?.entries.slice(3) ?? [];
  const meListed = data?.entries.some((e) => e.isMe) ?? false;

  return (
    <Screen>
      <BackButton onPress={back} title="Home" />
      <Reveal index={0}>
        <View testID="leaderboard-header" style={{ gap: spacing.xs }}>
          <Text variant="caption" style={{ color: colors.champagne, letterSpacing: 1 }}>
            HALL OF ACHIEVEMENT
          </Text>
          <Text variant="title" accessibilityRole="header">
            Learners Leaderboard
          </Text>
          <Text tone="muted">
            Ranked by lessons completed {data ? PERIOD_WORD[data.period] : ""}. Quizzes, mistakes
            and trading never count.
          </Text>
        </View>
      </Reveal>

      <SegmentedControl testID="period" options={PERIODS} value={period} onChange={setPeriod} />
      {courses.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <Chip label="All courses" selected={!courseId} onPress={() => setCourseId(undefined)} />
          {courses.map((c) => (
            <Chip
              key={c.id}
              label={c.title}
              selected={courseId === c.id}
              onPress={() => setCourseId(c.id)}
            />
          ))}
        </View>
      ) : null}

      {message ? <Banner kind="error" message={message} testID="leaderboard-error" /> : null}

      {q.status === "pending" ? (
        <StateView state="loading" />
      ) : q.status === "error" ? (
        <StateView
          state={isAppError(q.error) && q.error.kind === "network" ? "offline" : "error"}
          message={isAppError(q.error) ? q.error.message : messageFor("unknown")}
          onAction={() => void q.refetch()}
        />
      ) : data ? (
        <>
          {!data.me.optedIn ? (
            <View
              testID="join-card"
              style={{ ...raised, padding: spacing.lg, gap: spacing.sm, borderRadius: radii.card }}
            >
              <Text variant="bodyStrong">Join the leaderboard?</Text>
              <Text tone="muted">
                Others will see your display name and your count of completed lessons. Nothing else.
                You can leave whenever you like.
              </Text>
              <Button
                label="Join the leaderboard"
                loading={join.isPending}
                onPress={() => join.mutate(true)}
              />
            </View>
          ) : (
            <View
              testID="my-standing"
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
            >
              <Feather name="award" size={20} color={colors.champagne} accessible={false} />
              <Text style={{ flex: 1 }}>
                {data.me.rank
                  ? `You are ranked ${data.me.rank} with ${lessonsText(data.me.completedLessons ?? 0)}.`
                  : "Complete a lesson to get a rank for this view."}
              </Text>
              <Button
                label="Leave"
                variant="tertiary"
                loading={join.isPending}
                onPress={() => join.mutate(false)}
              />
            </View>
          )}

          {data.entries.length === 0 ? (
            <StudioEmpty
              icon="award"
              title="No one is ranked yet"
              message="Learners appear here after they join and complete a lesson in this view."
            />
          ) : (
            <>
              <Podium entries={data.entries} />
              <View style={{ gap: spacing.sm }} testID="board-list">
                {rest.map((e) => (
                  <Row key={`${e.rank}-${e.displayName}`} entry={e} />
                ))}
                {data.me.rank && !meListed ? (
                  <>
                    <Text variant="caption" tone="muted" style={{ textAlign: "center" }}>
                      …
                    </Text>
                    <Row
                      entry={{
                        rank: data.me.rank,
                        displayName: "You",
                        completedLessons: data.me.completedLessons ?? 0,
                        isMe: true,
                      }}
                    />
                  </>
                ) : null}
              </View>
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}
