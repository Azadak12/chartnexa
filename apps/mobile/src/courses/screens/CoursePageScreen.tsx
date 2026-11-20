import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { View } from "react-native";
import type { PublicCourseDetail } from "@chartnexa/api-contracts";
import { BackButton } from "../../kit/BackButton";
import { TabBar } from "../../kit/TabBar";
import { isAppError, messageFor } from "../../api/errors";
import { shouldRetry } from "../../state/query-client";
import { StateView } from "../../state/StateView";
import { colors, neutrals, radii, spacing } from "../../theme";
import { Banner, Button, Screen, Skeleton, Text, useSubmitOnce } from "../../ui";
import { courseApi } from "../course-api";
import { LEVEL_LABEL } from "../CourseCard";
import { CoverBlock } from "../CoverBlock";
import { LessonOutlineSection } from "../../lessons/screens/LessonOutlineSection";
import { lessonApi } from "../../lessons/lesson-api";
import { ProgressRing } from "../../kit/ProgressRing";
import { ProgressBar } from "../../progress/ProgressBar";
import { RatingSummary } from "../../reviews/RatingSummary";
import { ReviewsSection } from "../../reviews/ReviewsSection";
import { formatPrice } from "../money";
import { BuySection } from "../../payments/BuySection";
import { LiveClassesSection } from "../../live/LiveClassesSection";

export function CoursePageScreen() {
  const router = useRouter();
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
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
    if (!target) target = (await lessonApi.outline(courseId)).items[0]?.id ?? null;
    if (!target) throw new Error("No lesson available");
    if (target) router.push(`/course/${courseId}/lesson/${target}`);
  };
  return <CourseDetails c={c} goHome={goHome} goToLesson={goToLesson} initialTab={tab} />;
}

type Tab = "overview" | "learn" | "curriculum" | "reviews";
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "learn", label: "What You Will Learn" },
  { key: "curriculum", label: "Curriculum" },
  { key: "reviews", label: "Reviews" },
] as const;

function CourseDetails({
  c,
  goHome,
  goToLesson,
  initialTab,
}: {
  initialTab?: string;
  c: PublicCourseDetail;
  goHome: () => void;
  goToLesson: (courseId: string, lessonId: string | null) => Promise<void>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(TABS.find((t) => t.key === initialTab)?.key ?? "overview");
  // Shared with the curriculum tab, so one request serves both.
  const outline = useQuery({
    queryKey: ["lessons", c.id, c.enrolled],
    queryFn: () => lessonApi.outline(c.id),
    retry: shouldRetry,
  });
  const preview = outline.data?.items.find((l) => l.isPreview) ?? null;
  const next = outline.data?.items.find((l) => l.id === c.nextLessonId);
  const [actionError, setActionError] = useState<string | null>(null);
  const { run: continueLesson, pending: openingLesson } = useSubmitOnce(async () => {
    setActionError(null);
    try {
      await goToLesson(c.id, c.nextLessonId);
    } catch (e) {
      setActionError(
        isAppError(e) ? e.message : "The lesson could not be opened. Please try again.",
      );
    }
  });

  return (
    <Screen>
      <BackButton onPress={goHome} />
      <CoverBlock tone={c.coverTone} height={200} thumbnailUrl={c.thumbnailUrl} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <View
          style={{
            backgroundColor: colors.blueTint,
            borderRadius: radii.pill,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <Text variant="caption" tone="link">
            {c.categoryName ?? "CHARTNEXA ACADEMY"}
          </Text>
        </View>
      </View>
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
          flexWrap: "wrap",
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
      <View
        testID="course-at-a-glance"
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radii.card,
          backgroundColor: colors.surface,
          borderWidth: 2,
          borderBottomWidth: 5,
          borderColor: neutrals.divider,
        }}
      >
        <View style={{ flex: 1, minWidth: 100, gap: spacing.xs }}>
          <Feather name="book-open" size={20} color={colors.blue} accessible={false} />
          <Text variant="heading">{c.lessonCount}</Text>
          <Text variant="caption" tone="muted">
            {c.lessonCount === 1 ? "Lesson" : "Lessons"}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 100, gap: spacing.xs }}>
          <Feather name="play-circle" size={20} color={colors.blue} accessible={false} />
          <Text variant="heading">{c.previewCount}</Text>
          <Text variant="caption" tone="muted">
            {c.previewCount === 1 ? "Free preview" : "Free previews"}
          </Text>
        </View>
      </View>

      {c.enrolled ? (
        <View
          style={{
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: radii.card,
            backgroundColor: colors.blueTint,
            borderWidth: 2,
            borderBottomWidth: 5,
            borderColor: colors.blue,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            {c.progress && c.progress.total > 0 ? (
              <ProgressRing
                completed={c.progress.completed}
                total={c.progress.total}
                size={64}
                stroke={7}
                testID="course-progress-ring"
              />
            ) : null}
            <Text variant="heading" style={{ flex: 1 }}>
              Your next chapter
            </Text>
          </View>
          <View
            accessible
            accessibilityLabel="You are enrolled in this course"
            testID="enrolled-notice"
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radii.pill,
              backgroundColor: neutrals.surface,
              borderWidth: 1,
              borderColor: neutrals.divider,
            }}
          >
            <Feather name="check" size={14} color={colors.blue} accessible={false} />
            <Text variant="caption" tone="link">
              Enrolled
            </Text>
          </View>
          {c.onSale ? null : (
            <Text variant="caption" tone="muted" testID="not-on-sale">
              This course is not currently on sale. You keep your access.
            </Text>
          )}
          {c.progress ? (
            <ProgressBar
              completed={c.progress.completed}
              total={c.progress.total}
              testID="course-progress"
            />
          ) : null}
          {next ? <Text tone="muted">Up next: {next.title}</Text> : null}
          {actionError ? <Banner kind="error" message={actionError} /> : null}
          {c.progress && c.progress.total > 0 ? (
            <Button
              label={c.nextLessonId ? "Continue" : "Review course"}
              loading={openingLesson}
              onPress={() => void continueLesson()}
            />
          ) : null}
        </View>
      ) : (
        <View
          style={{
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: radii.card,
            backgroundColor: colors.blueTint,
          }}
        >
          <Text variant="heading">Start exploring this course</Text>
          {preview ? <Text tone="muted">Try “{preview.title}” before you decide.</Text> : null}
          <BuySection courseId={c.id} priceCents={c.priceCents} />
          {preview ? (
            <Button
              label="Watch Preview"
              variant="secondary"
              onPress={() => router.push(`/course/${c.id}/lesson/${preview.id}`)}
            />
          ) : null}
        </View>
      )}

      {outline.isError ? (
        <View style={{ gap: spacing.sm }} testID="course-outline-error">
          <Text tone="muted">Course topics and previews could not be loaded.</Text>
          <Button
            label="Retry course content"
            variant="secondary"
            onPress={() => void outline.refetch()}
          />
        </View>
      ) : null}
      <TabBar tabs={TABS} value={tab} onChange={setTab} />

      {tab === "overview" ? (
        <View style={{ gap: spacing.lg }} testID="panel-overview">
          <Text variant="heading" accessibilityRole="header">
            About this course
          </Text>
          {c.description ? (
            <Text>{c.description}</Text>
          ) : (
            <Text tone="muted">No description yet.</Text>
          )}
          {c.enrolled ? <LiveClassesSection courseId={c.id} /> : null}
        </View>
      ) : null}
      {tab === "learn" && !outline.isError ? (
        <LearnPanel outline={outline.data} loading={outline.isPending} />
      ) : null}
      {tab === "curriculum" ? <LessonOutlineSection courseId={c.id} enrolled={c.enrolled} /> : null}
      {tab === "reviews" ? (
        <ReviewsSection courseId={c.id} enrolled={c.enrolled} rating={c.rating} />
      ) : null}
      <Button label="Back to courses" variant="secondary" onPress={goHome} />
    </Screen>
  );
}

/**
 * The course has no separate "learning outcomes" field, so this lists what it really contains:
 * its modules and lesson titles. Nothing is invented.
 */
function LearnPanel({
  outline,
  loading,
}: {
  outline:
    | {
        items: { id: string; title: string; moduleId: string | null }[];
        modules?: { id: string; title: string }[];
      }
    | undefined;
  loading: boolean;
}) {
  if (loading) return <Skeleton height={96} />;
  const lessons = outline?.items ?? [];
  if (lessons.length === 0) {
    return (
      <Text tone="muted" testID="learn-empty">
        The topics will be listed once lessons are added.
      </Text>
    );
  }
  const modules = outline?.modules ?? [];
  const lines = modules.length > 0 ? modules.map((m) => m.title) : lessons.map((l) => l.title);
  return (
    <View style={{ gap: spacing.sm }} testID="panel-learn">
      <Text tone="muted" variant="caption">
        Topics covered, taken from this course's {modules.length > 0 ? "modules" : "lessons"}.
      </Text>
      {lines.map((t, i) => (
        <View key={`${i}-${t}`} style={{ flexDirection: "row", gap: spacing.sm }}>
          <Feather name="check-circle" size={18} color={colors.blue} accessible={false} />
          <Text style={{ flex: 1 }}>{t}</Text>
        </View>
      ))}
    </View>
  );
}
