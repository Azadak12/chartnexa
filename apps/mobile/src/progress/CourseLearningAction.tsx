import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { courseApi } from "../courses/course-api";
import { isAppError, messageFor } from "../api/errors";
import { Banner, Button, useSubmitOnce } from "../ui";
import { spacing } from "../theme";

/** Resolve on demand: no request per card and no guessed next lesson. */
export function CourseLearningAction({
  courseId,
  completed,
  total,
}: {
  courseId: string;
  completed: number;
  total: number;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useSubmitOnce(async () => {
    setError(null);
    try {
      const course = await courseApi.get(courseId);
      if (!course.enrolled) {
        setError("You no longer have access to this course.");
        void qc.invalidateQueries({ queryKey: ["my-courses"] });
        void qc.invalidateQueries({ queryKey: ["continue-learning"] });
        return;
      }
      qc.setQueryData(["course", courseId], course);
      if (course.nextLessonId) router.push(`/course/${courseId}/lesson/${course.nextLessonId}`);
      else router.push(`/course/${courseId}?tab=curriculum`);
    } catch (e) {
      setError(isAppError(e) ? e.message : messageFor("unknown"));
    }
  });
  if (total === 0) return null;
  const done = completed >= total;
  return (
    <View style={{ gap: spacing.sm }}>
      {error ? <Banner kind="error" message={error} /> : null}
      <Button
        label={done ? "Review course" : completed > 0 ? "Continue" : "Start"}
        variant={done ? "secondary" : "primary"}
        loading={pending}
        onPress={() => void run()}
      />
    </View>
  );
}
