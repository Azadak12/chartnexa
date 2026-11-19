import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { isAppError, messageFor } from "../../api/errors";
import { shouldRetry } from "../../state/query-client";
import { StateView } from "../../state/StateView";
import { spacing } from "../../theme";
import { Banner, Button, Screen, Text } from "../../ui";
import { courseApi } from "../course-api";
import { LEVEL_LABEL } from "../CourseCard";
import { CoverBlock } from "../CoverBlock";
import { LessonOutlineSection } from "../../lessons/screens/LessonOutlineSection";
import { lessonApi } from "../../lessons/lesson-api";
import { ProgressBar } from "../../progress/ProgressBar";
import { RatingSummary } from "../../reviews/RatingSummary";
import { ReviewsSection } from "../../reviews/ReviewsSection";
import { formatPrice } from "../money";
import { BuySection } from "../../payments/BuySection";
import { LiveClassesSection } from "../../live/LiveClassesSection";

export function CoursePageScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["course", id],
    queryFn: () => courseApi.get(String(id)),
    // Only transient failures are retried; a missing or forbidden course will not appear by retrying.
    retry: shouldRetry,
  });
  const goHome = () => (router.canGoBack() ? router.back() : router.replace("/explore"));

  if (query.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (query.status === "error") {
    const e = query.error;
    if (isAppError(e) && e.kind === "not_found") {
      return (
        <Screen>
          <StateView
            state="empty"
            title="Course not found"
            message="This course is not available. It may have been removed."
            actionLabel="Back to courses"
            onAction={goHome}
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
      </Screen>
    );
  }

  const c = query.data;
  /** Opens the next lesson, or the first one when everything is complete. */
  const goToLesson = async (courseId: string, lessonId: string | null) => {
    let target = lessonId;
    if (!target) {
      try {
        target = (await lessonApi.outline(courseId)).items[0]?.id ?? null;
      } catch {
        target = null;
      }
    }
    if (target) router.push(`/course/${courseId}/lesson/${target}`);
  };
  return (
    <Screen>
      <CoverBlock tone={c.coverTone} height={190} thumbnailUrl={c.thumbnailUrl} />
      <Text variant="title" accessibilityRole="header">
        {c.title}
      </Text>
      {c.instructor ? (
        <Text tone="muted" testID="course-instructor">
          Taught by {c.instructor.displayName}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: spacing.sm,
        }}
      >
        <Text tone="muted">
          {LEVEL_LABEL[c.level]}
          {c.categoryName ? ` · ${c.categoryName}` : ""}
        </Text>
        <Text variant="heading" testID="course-price">
          {formatPrice(c.priceCents)}
        </Text>
      </View>
      <RatingSummary rating={c.rating} testID="course-rating" />
      {c.enrolled ? (
        <>
          <Banner
            kind="success"
            message="You are enrolled in this course."
            testID="enrolled-notice"
          />
          {c.onSale ? null : (
            <Text variant="caption" tone="muted" testID="not-on-sale">
              This course is not currently on sale. You keep your access.
            </Text>
          )}
        </>
      ) : (
        <BuySection courseId={c.id} priceCents={c.priceCents} />
      )}
      {c.description ? <Text>{c.description}</Text> : null}
      {c.enrolled && c.progress ? (
        <View style={{ gap: spacing.md }}>
          <ProgressBar
            completed={c.progress.completed}
            total={c.progress.total}
            testID="course-progress"
          />
          {c.progress.total > 0 ? (
            <Button
              label={c.nextLessonId ? "Continue" : "Review course"}
              onPress={() => void goToLesson(c.id, c.nextLessonId)}
            />
          ) : null}
        </View>
      ) : null}
      {c.enrolled ? <LiveClassesSection courseId={c.id} /> : null}
      <LessonOutlineSection courseId={c.id} enrolled={c.enrolled} />
      <ReviewsSection courseId={c.id} enrolled={c.enrolled} rating={c.rating} />
      <Button label="Back to courses" variant="secondary" onPress={goHome} />
    </Screen>
  );
}
