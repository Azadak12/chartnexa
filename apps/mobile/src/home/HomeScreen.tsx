import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { announcementApi } from "../announcements/announcement-api";
import { accountApi } from "../auth/account-api";
import { VerificationBanner } from "../auth/VerificationBanner";
import { courseApi } from "../courses/course-api";
import { FeaturedCourseCard } from "../kit/CourseCards";
import { AppHeader } from "../kit/AppHeader";
import { LoadingSkeleton } from "../kit/Feedback";
import { NextLiveCard } from "../live/NextLiveCard";
import { ResumeLearning } from "../progress/ResumeLearning";
import { myCoursesApi } from "../entitlements/entitlement-api";
import { ProgressRing } from "../kit/ProgressRing";
import { CourseStrip } from "../progress/CourseStrip";
import { CourseHero } from "../progress/CourseHero";
import { useScreenMemoryState } from "../navigation/screen-memory";
import { Reveal } from "../kit/Reveal";
import { PressableCard } from "../kit/PressableCard";
import { colors, neutrals, radii, spacing } from "../theme";
import { Screen, Text } from "../ui";

/** "Good morning, Sam": time of day from the phone's clock. */
export function greetingFor(name: string | null | undefined, now = new Date()): string {
  const h = now.getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

/** The student's dashboard. Every number and course here comes from the backend. */
export function HomeScreen() {
  const router = useRouter();
  const me = useQuery({ queryKey: ["me"], queryFn: accountApi.me });
  const unread = useQuery({
    queryKey: ["announcements-unread"],
    queryFn: announcementApi.unread,
    staleTime: 0,
  });
  const featured = useQuery({
    queryKey: ["featured"],
    queryFn: () => courseApi.list({ limit: 8 }),
  });
  // Real totals from the student's own courses; hidden when none exist or the call fails.
  const mine = useQuery({ queryKey: ["my-courses", "home"], queryFn: () => myCoursesApi.list() });
  const owned = mine.data?.items ?? [];
  const lessonsDone = owned.reduce((n, c) => n + c.progress.completed, 0);
  const lessonsTotal = owned.reduce((n, c) => n + c.progress.total, 0);
  const coursesDone = owned.filter(
    (c) => c.progress.total > 0 && c.progress.completed >= c.progress.total,
  ).length;
  const [selectedId, setSelectedId] = useScreenMemoryState<string>("my-courses:selected", "");
  const selectedCourse = owned.find((c) => c.id === selectedId) ?? owned[0];

  return (
    <Screen>
      <AppHeader
        bar={false}
        greeting={greetingFor(me.data?.displayName)}
        unread={unread.data ?? 0}
        onBell={() => router.push("/profile/announcements")}
        name={me.data?.displayName}
        onProfile={() => router.push("/profile")}
      />
      {me.data && !me.data.emailVerified ? <VerificationBanner /> : null}

      {lessonsTotal > 0 ? (
        <Reveal index={0}>
          <View
            testID="home-progress-card"
            style={{
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: radii.card,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: neutrals.divider,
            }}
          >
            <PressableCard
              testID="home-progress"
              accessibilityLabel={`Your progress: ${lessonsDone} of ${lessonsTotal} lessons done, ${coursesDone} of ${owned.length} courses completed. Opens My Learning`}
              onPress={() => router.push("/courses")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                borderWidth: 0,
                borderBottomWidth: 0,
                backgroundColor: "transparent",
                shadowOpacity: 0,
                elevation: 0,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="caption" tone="muted" style={{ letterSpacing: 1.5 }}>
                  YOUR PROGRESS
                </Text>
                <Text variant="heading">
                  {lessonsDone}/{lessonsTotal} lessons
                </Text>
                <Text variant="caption" tone="muted">
                  {coursesDone} of {owned.length} {owned.length === 1 ? "course" : "courses"}{" "}
                  completed
                </Text>
              </View>
              <ProgressRing
                completed={lessonsDone}
                total={lessonsTotal}
                size={68}
                stroke={7}
                testID="home-progress-ring"
              />
            </PressableCard>
            <CourseStrip
              courses={owned}
              selectedId={selectedCourse?.id}
              onSelect={(c) => setSelectedId(c.id)}
            />
          </View>
        </Reveal>
      ) : null}
      <Reveal index={1}>
        <ResumeLearning />
      </Reveal>
      {selectedCourse ? (
        <CourseHero
          course={selectedCourse}
          alwaysPath
          onOpen={() => router.push(`/course/${selectedCourse.id}`)}
        />
      ) : null}
      <NextLiveCard />
      <PressableCard
        testID="home-lab"
        accessibilityLabel="Learning Lab: practice reading charts"
        onPress={() => router.push("/lab")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radii.card,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: neutrals.divider,
          borderBottomWidth: 1,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: colors.blue,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="activity" size={22} color={colors.onBlue} accessible={false} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">Learning Lab</Text>
          <Text variant="caption" tone="muted">
            Practice reading charts. Simulated, not live prices.
          </Text>
        </View>
        <Feather name="chevron-right" size={22} color={colors.blue} accessible={false} />
      </PressableCard>

      {mine.status !== "pending" && owned.length === 0 ? (
        <View style={{ gap: spacing.sm }}>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <Text variant="heading" accessibilityRole="header">
              Featured courses
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="See all courses"
              onPress={() => router.push("/explore")}
              hitSlop={8}
            >
              <Text tone="link" variant="bodyStrong">
                See all
              </Text>
            </Pressable>
          </View>
          {featured.status === "pending" ? (
            <LoadingSkeleton rows={2} />
          ) : featured.status === "error" ? (
            <Text tone="muted">
              Courses could not be loaded. Pull to retry from the Explore tab.
            </Text>
          ) : featured.data.items.length === 0 ? (
            <Text tone="muted">Courses will appear here once they are published.</Text>
          ) : (
            <FlatList
              horizontal
              data={featured.data.items}
              keyExtractor={(c) => c.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.md }}
              testID="featured-list"
              renderItem={({ item }) => (
                <FeaturedCourseCard
                  course={item}
                  onPress={() => router.push(`/course/${item.id}`)}
                />
              )}
            />
          )}
        </View>
      ) : null}
    </Screen>
  );
}
