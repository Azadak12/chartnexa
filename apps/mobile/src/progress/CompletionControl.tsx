import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import type { ProgressResponse } from "@chartnexa/api-contracts";
import { isAppError, messageFor } from "../api/errors";
import { spacing } from "../theme";
import { Banner, Button, Text, useSubmitOnce } from "../ui";
import { progressApi } from "./progress-api";

const NO_ACCESS = "You no longer have access to this course, so progress cannot be saved.";

/**
 * Mark a lesson complete, or undo it. It waits for the server: a wrong "Completed" is worse than
 * a short wait. A failure keeps the old state and leaves the button ready for another try.
 */
export function CompletionControl({
  courseId,
  lessonId,
  completed,
}: {
  courseId: string;
  lessonId: string;
  completed: boolean;
}) {
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const { run, pending } = useSubmitOnce(async () => {
    setMessage(null);
    try {
      const result = completed
        ? await progressApi.unmark(courseId, lessonId)
        : await progressApi.mark(courseId, lessonId);
      qc.setQueryData<ProgressResponse>(["progress", courseId], (old) => {
        if (!old) return old;
        const others = old.lessons.filter((l) => l.lessonId !== lessonId);
        const lessons = result.completed
          ? [...others, { lessonId, completedAt: result.completedAt }]
          : others;
        return { ...old, lessons, completed: lessons.length };
      });
      void qc.invalidateQueries({ queryKey: ["progress", courseId] });
      void qc.invalidateQueries({ queryKey: ["course", courseId] });
      void qc.invalidateQueries({ queryKey: ["my-courses"] });
      AccessibilityInfo.announceForAccessibility(
        result.completed ? "Lesson marked complete" : "Lesson marked not complete",
      );
    } catch (e) {
      if (isAppError(e) && e.kind === "forbidden") {
        setMessage(NO_ACCESS);
        void qc.invalidateQueries({ queryKey: ["course", courseId] });
        void qc.invalidateQueries({ queryKey: ["my-courses"] });
        return;
      }
      setMessage(isAppError(e) ? e.message : messageFor("unknown"));
    }
  });

  return (
    <View style={{ gap: spacing.sm }} testID="completion-control">
      {completed ? (
        <Text variant="bodyStrong" tone="success" testID="lesson-completed">
          ✓ Completed
        </Text>
      ) : null}
      {message ? <Banner kind="error" message={message} testID="completion-error" /> : null}
      <Button
        label={completed ? "Mark as not complete" : "Mark as complete"}
        variant={completed ? "tertiary" : "primary"}
        loading={pending}
        onPress={() => void run()}
      />
    </View>
  );
}
