import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import type { VideoProgress } from "@chartnexa/api-contracts";
import { apiBaseUrl } from "../api/client";
import { isAppError } from "../api/errors";
import { shouldRetry } from "../state/query-client";
import { spacing } from "../theme";
import { Banner, Button, Chip, Text } from "../ui";
import { NativePlayer, type PlayerStatus } from "./NativePlayer";
import { clock, minutesText, videoApi } from "./video-api";

export const REPORT_EVERY_SECONDS = 15;
const SPEEDS = [1, 1.25, 1.5, 2] as const;

/**
 * A lesson's video: native controls (play, pause, seek, fullscreen and landscape), a speed choice,
 * resuming where the owner stopped, and watch reports every 15 seconds. The server decides how
 * much watching counts; the app only reports what was played.
 */
export function VideoLesson({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["lesson-video", courseId, lessonId],
    queryFn: () => videoApi.get(courseId, lessonId),
    retry: shouldRetry,
  });
  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [rate, setRate] = useState<(typeof SPEEDS)[number]>(1);
  const [progress, setProgress] = useState<VideoProgress | null>(null);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(0);
  const position = useRef(0);
  const lastPosition = useRef<number | null>(null);
  const sinceReport = useRef(0);
  const sending = useRef(false);
  const video = q.data ?? null;
  const owner = video?.progress != null;

  useEffect(() => {
    if (video?.progress) setProgress(video.progress);
  }, [video]);

  const report = useCallback(async () => {
    if (!owner || sending.current) return;
    sending.current = true;
    const delta = Math.min(600, Math.round(pending.current));
    try {
      const wasDone = progress?.completed ?? false;
      const next = await videoApi.report(courseId, lessonId, Math.floor(position.current), delta);
      pending.current = Math.max(0, pending.current - delta);
      setProgress(next);
      if (next.completed && !wasDone) {
        AccessibilityInfo.announceForAccessibility("Lesson complete");
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["progress", courseId] }),
          qc.invalidateQueries({ queryKey: ["course", courseId] }),
          qc.invalidateQueries({ queryKey: ["my-courses"] }),
        ]);
      }
    } catch {
      // Kept for the next report; a dropped connection loses nothing.
    } finally {
      sending.current = false;
    }
  }, [owner, courseId, lessonId, progress, qc]);

  const onTick = useCallback(
    (seconds: number, playing: boolean) => {
      const prev = lastPosition.current;
      lastPosition.current = seconds;
      position.current = seconds;
      // Count only forward playback of about one tick; a seek is not watching.
      if (playing && prev !== null && seconds > prev && seconds - prev <= 3) {
        pending.current += seconds - prev;
        sinceReport.current += 1;
      }
      if (sinceReport.current >= REPORT_EVERY_SECONDS) {
        sinceReport.current = 0;
        void report();
      }
    },
    [report],
  );

  // Whatever was watched is reported when the person leaves the lesson. Through a ref: depending
  // on `report` would send a report every time progress changes, which changes `report` again.
  const reportRef = useRef(report);
  reportRef.current = report;
  useEffect(() => () => void reportRef.current(), []);

  if (q.status === "pending") return <Text tone="muted">Loading video…</Text>;
  if (q.status === "error") {
    if (isAppError(q.error) && q.error.kind === "forbidden") return null;
    return (
      <View style={{ gap: spacing.sm }}>
        <Banner kind="error" message="The video could not be loaded." testID="video-error" />
        <Button label="Retry video" variant="secondary" onPress={() => void q.refetch()} />
      </View>
    );
  }
  if (!video) return null;
  const startAt = video.progress && !video.progress.completed ? video.progress.positionSeconds : 0;
  const percent =
    progress && progress.requiredSeconds > 0
      ? Math.min(100, Math.round((progress.watchedSeconds / (video.durationSeconds || 1)) * 100))
      : 0;

  return (
    <View style={{ gap: spacing.sm }} testID="lesson-video">
      <Text variant="subheading" accessibilityRole="header">
        Video, {minutesText(video.durationSeconds)}
      </Text>
      {startAt > 0 ? (
        <Text variant="caption" tone="muted" testID="video-resume">
          Continues from {clock(startAt)}
        </Text>
      ) : null}
      <NativePlayer
        key={`${video.playback.url}-${attempt}`}
        url={`${apiBaseUrl()}${video.playback.url}`}
        startAt={startAt}
        rate={rate}
        onTick={onTick}
        onStatus={setStatus}
        label={`Lesson video, ${minutesText(video.durationSeconds)}`}
      />
      {status === "loading" ? (
        <Text variant="caption" tone="muted" testID="video-buffering">
          Loading video…
        </Text>
      ) : null}
      {status === "error" ? (
        <View style={{ gap: spacing.sm }}>
          <Banner
            kind="error"
            message="The video stopped. Check your connection and try again."
            testID="video-play-error"
          />
          <Button
            label="Try video again"
            variant="secondary"
            onPress={async () => {
              await q.refetch();
              setAttempt((a) => a + 1);
            }}
          />
        </View>
      ) : null}
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
        accessibilityLabel="Playback speed"
      >
        {SPEEDS.map((s) => (
          <Chip key={s} label={`${s}x`} selected={rate === s} onPress={() => setRate(s)} />
        ))}
      </View>
      {progress ? (
        progress.completed ? (
          <Text variant="bodyStrong" tone="success" testID="video-complete">
            ✓ Completed
          </Text>
        ) : (
          <Text variant="caption" tone="muted" testID="video-progress">
            Watched {percent} percent. The lesson completes at 90 percent.
          </Text>
        )
      ) : null}
    </View>
  );
}
