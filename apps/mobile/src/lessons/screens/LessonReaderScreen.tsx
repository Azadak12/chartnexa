import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LESSON_ERROR_CODES } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../../api/errors";
import { shouldRetry } from "../../state/query-client";
import { useScreenMemoryState } from "../../navigation/screen-memory";
import { StateView } from "../../state/StateView";
import { colors, MIN_TOUCH_SIZE, neutrals, spacing } from "../../theme";
import { Banner, Button, Screen, Text, useReducedMotion } from "../../ui";
import { focusElement } from "../../ui/focus";
import { courseApi } from "../../courses/course-api";
import { LessonFilesSection } from "../../resources/LessonFilesSection";
import { CompletionControl } from "../../progress/CompletionControl";
import { progressApi } from "../../progress/progress-api";
import { lessonApi } from "../lesson-api";
import { clampStep, splitLessonText } from "../steps";

/** A free-preview lesson, full screen. Back returns to the course page where it was left. */
export function LessonReaderScreen() {
  const router = useRouter();
  const { id, lessonId } = useLocalSearchParams<{ id: string; lessonId: string }>();
  const query = useQuery({
    queryKey: ["lesson", id, lessonId],
    queryFn: () => lessonApi.get(String(id), String(lessonId)),
    retry: shouldRetry,
  });
  const qc = useQueryClient();
  // Only owners can record progress; the course page already fetched this, so it is usually cached.
  const course = useQuery({
    queryKey: ["course", id],
    queryFn: () => courseApi.get(String(id)),
    retry: shouldRetry,
  });
  const owner = course.status === "success" && course.data.enrolled;
  const progress = useQuery({
    queryKey: ["progress", id],
    enabled: owner,
    queryFn: () => progressApi.read(String(id)),
    retry: shouldRetry,
  });
  const done = progress.data?.lessons.some((l) => l.lessonId === lessonId) ?? false;
  const e = query.status === "error" ? query.error : null;
  const lostAccess =
    isAppError(e) && e.kind === "forbidden" && e.code === LESSON_ERROR_CODES.enrollmentRequired;
  // The course page must stop showing this person as enrolled.
  useEffect(() => {
    if (lostAccess) {
      void qc.invalidateQueries({ queryKey: ["course", id] });
      void qc.invalidateQueries({ queryKey: ["lessons", id] });
      void qc.invalidateQueries({ queryKey: ["my-courses"] });
    }
  }, [lostAccess, qc, id]);
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/course/${id}`));

  // Reading position and mode live in memory only: gone after sign-out or a restart.
  const [savedStep, setSavedStep] = useScreenMemoryState<number>(
    `lesson-step:${id}:${lessonId}`,
    0,
  );
  const [mode, setMode] = useScreenMemoryState<"steps" | "all">("lesson-mode", "steps");
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(1)).current;
  const stepRef = useRef(null);
  const moved = useRef(false);
  const steps = query.status === "success" ? splitLessonText(query.data.body) : [];
  const step = clampStep(savedStep, steps.length);

  // After a step change: fade in (unless motion is reduced) and put screen-reader focus on the text.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    if (reduced === false) {
      fade.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
    focusElement(stepRef);
  }, [step, reduced, fade]);

  const goTo = (next: number) => {
    const target = clampStep(next, steps.length);
    if (target === step) return;
    moved.current = true;
    setSavedStep(target);
    AccessibilityInfo.announceForAccessibility(`Step ${target + 1} of ${steps.length}`);
  };

  if (query.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (query.status === "error") {
    if (lostAccess) {
      return (
        <Screen>
          <StateView
            state="empty"
            title="You no longer have access to this lesson"
            message="Your access to this course has ended. If you think this is a mistake, contact the academy."
            actionLabel="Back to course"
            onAction={back}
          />
        </Screen>
      );
    }
    // A deleted or unpublished lesson, or one that is not a free preview (403), are all "gone" here.
    if (isAppError(e) && (e.kind === "not_found" || e.kind === "forbidden")) {
      return (
        <Screen>
          <StateView
            state="empty"
            title="This lesson is no longer available"
            message="It may have been removed, or it is not open for preview."
            actionLabel="Back to course"
            onAction={back}
          />
        </Screen>
      );
    }
    return (
      <Screen>
        <StateView
          state={isAppError(e) && e.kind === "network" ? "offline" : "error"}
          message={isAppError(e) ? e.message : messageFor("unknown")}
          requestId={isAppError(e) ? e.requestId : null}
          onAction={() => void query.refetch()}
        />
        <Button label="Back" variant="tertiary" onPress={back} />
      </Screen>
    );
  }

  const l = query.data;
  const many = steps.length > 1;
  const stepping = many && mode === "steps";
  const last = step === steps.length - 1;
  return (
    <Screen>
      <Text variant="caption" tone="muted">
        Lesson {l.position} · Free preview
        {stepping ? ` · Step ${step + 1} of ${steps.length}` : ""}
      </Text>
      <Text variant="title" accessibilityRole="header">
        {l.title}
      </Text>
      {steps.length === 0 ? (
        <Text tone="muted">This lesson has no text yet.</Text>
      ) : stepping ? (
        <>
          <View
            testID="lesson-progress"
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Step ${step + 1} of ${steps.length}`}
            accessibilityValue={{ min: 1, max: steps.length, now: step + 1 }}
            style={{ height: 4, borderRadius: 2, backgroundColor: neutrals.divider }}
          >
            <View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.blue,
                width: `${((step + 1) / steps.length) * 100}%`,
              }}
            />
          </View>
          <Animated.View style={{ opacity: fade, minHeight: MIN_TOUCH_SIZE }}>
            <View ref={stepRef} accessible testID="lesson-step" collapsable={false}>
              <Text selectable>{steps[step]}</Text>
            </View>
          </Animated.View>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Back"
                variant="secondary"
                disabled={step === 0}
                accessibilityHint="Shows the previous step"
                onPress={() => goTo(step - 1)}
              />
            </View>
            <View style={{ flex: 1 }}>
              {last ? (
                <Button label="Back to course" onPress={back} />
              ) : (
                <Button
                  label="Next"
                  accessibilityHint="Shows the next step"
                  onPress={() => goTo(step + 1)}
                />
              )}
            </View>
          </View>
          <Button label="Show all text" variant="tertiary" onPress={() => setMode("all")} />
        </>
      ) : (
        <>
          <Text testID="lesson-body" selectable>
            {l.body}
          </Text>
          {many ? (
            <Button label="Show in steps" variant="tertiary" onPress={() => setMode("steps")} />
          ) : null}
        </>
      )}
      <LessonFilesSection courseId={String(id)} lessonId={String(lessonId)} />
      {owner && steps.length > 0 ? (
        progress.status === "success" ? (
          <CompletionControl courseId={String(id)} lessonId={String(lessonId)} completed={done} />
        ) : progress.status === "error" ? (
          <Banner kind="error" message="Progress could not be loaded." testID="progress-error" />
        ) : null
      ) : null}
      {stepping && !last ? (
        <Button label="Back to course" variant="tertiary" onPress={back} />
      ) : null}
      {!stepping ? <Button label="Back to course" variant="secondary" onPress={back} /> : null}
    </Screen>
  );
}
