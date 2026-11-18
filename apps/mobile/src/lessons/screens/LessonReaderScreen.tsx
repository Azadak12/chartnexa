import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LESSON_ERROR_CODES } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../../api/errors";
import { shouldRetry } from "../../state/query-client";
import { StateView } from "../../state/StateView";
import { Button, Screen, Text } from "../../ui";
import { lessonApi } from "../lesson-api";

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
  return (
    <Screen>
      <Text variant="caption" tone="muted">
        Lesson {l.position} · Free preview
      </Text>
      <Text variant="title" accessibilityRole="header">
        {l.title}
      </Text>
      {l.body.length > 0 ? (
        <Text testID="lesson-body" selectable>
          {l.body}
        </Text>
      ) : (
        <Text tone="muted">This lesson has no text yet.</Text>
      )}
      <Button label="Back to course" variant="secondary" onPress={back} />
    </Screen>
  );
}
