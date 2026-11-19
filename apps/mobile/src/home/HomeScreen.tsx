import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { announcementApi } from "../announcements/announcement-api";
import { accountApi } from "../auth/account-api";
import { VerificationBanner } from "../auth/VerificationBanner";
import { categoryApi } from "../categories/category-api";
import { courseApi } from "../courses/course-api";
import { FeaturedCourseCard } from "../kit/CourseCards";
import { AppHeader } from "../kit/AppHeader";
import { CourseThumbnail } from "../kit/CourseThumbnail";
import { LoadingSkeleton } from "../kit/Feedback";
import { ProgressRing } from "../kit/ProgressRing";
import { MarketPreviewCard } from "../lab/MarketPreviewCard";
import { NextLiveCard } from "../live/NextLiveCard";
import { continueApi } from "../progress/continue-api";
import { colors, neutrals, radii, spacing } from "../theme";
import { Screen, Text } from "../ui";

/** "Good morning, Sam": time of day from the phone's clock. */
export function greetingFor(name: string | null | undefined, now = new Date()): string {
  const h = now.getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

const CATEGORY_ICON: [RegExp, React.ComponentProps<typeof Feather>["name"]][] = [
  [/basic|fundamental|start/i, "compass"],
  [/candle|chart/i, "bar-chart-2"],
  [/technical|indicator/i, "activity"],
  [/risk|psych/i, "shield"],
  [/option/i, "layers"],
];
const iconFor = (name: string) => CATEGORY_ICON.find(([re]) => re.test(name))?.[1] ?? "book";

/** The student's dashboard. Every number and course here comes from the backend. */
export function HomeScreen() {
  const router = useRouter();
  const me = useQuery({ queryKey: ["me"], queryFn: accountApi.me });
  const unread = useQuery({
    queryKey: ["announcements-unread"],
    queryFn: announcementApi.unread,
    staleTime: 0,
  });
  const resume = useQuery({
    queryKey: ["continue-learning"],
    queryFn: continueApi.get,
    staleTime: 0,
  });
  const featured = useQuery({
    queryKey: ["featured"],
    queryFn: () => courseApi.list({ limit: 8 }),
  });
  const categories = useQuery({ queryKey: ["categories"], queryFn: categoryApi.list });
  const r = resume.data;
  const cats = (categories.data ?? []).filter((c) => c.courseCount > 0);

  return (
    <Screen>
      <AppHeader
        greeting={greetingFor(me.data?.displayName)}
        subtitle="Learn how markets work, one lesson at a time."
        unread={unread.data ?? 0}
        onBell={() => router.push("/profile/announcements")}
      />
      {me.data && !me.data.emailVerified ? <VerificationBanner /> : null}

      <MarketPreviewCard />

      {r ? (
        <View style={{ gap: spacing.sm }} testID="continue-learning">
          <Text variant="heading" accessibilityRole="header">
            Continue learning
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Continue ${r.courseTitle}: ${r.nextLessonTitle}. ${Math.round((r.completed / Math.max(1, r.total)) * 100)} percent complete`}
            onPress={() => router.push(`/course/${r.courseId}/lesson/${r.nextLessonId}`)}
            style={({ pressed }) => ({
              flexDirection: "row",
              gap: spacing.md,
              alignItems: "center",
              padding: spacing.md,
              borderRadius: radii.card,
              borderWidth: 1,
              borderColor: neutrals.divider,
              backgroundColor: pressed ? neutrals.surface : colors.white,
            })}
          >
            <CourseThumbnail
              tone={
                (["blue", "black", "tint"].includes(r.coverTone) ? r.coverTone : "blue") as "blue"
              }
              thumbnailUrl={r.thumbnailUrl}
              width={96}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={2}>
                {r.courseTitle}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={2}>
                Next: {r.nextLessonTitle}
              </Text>
              <Text variant="caption" tone="link">
                Continue
              </Text>
            </View>
            <ProgressRing
              completed={r.completed}
              total={r.total}
              size={52}
              stroke={6}
              testID="continue-ring"
            />
          </Pressable>
        </View>
      ) : null}

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
          <Text tone="muted">Courses could not be loaded. Pull to retry from the Explore tab.</Text>
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
              <FeaturedCourseCard course={item} onPress={() => router.push(`/course/${item.id}`)} />
            )}
          />
        )}
      </View>

      {cats.length > 0 ? (
        <View style={{ gap: spacing.sm }} testID="category-shortcuts">
          <Text variant="heading" accessibilityRole="header">
            Trading Categories
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {cats.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`${c.name}, ${c.courseCount} ${c.courseCount === 1 ? "course" : "courses"}`}
                onPress={() => router.push({ pathname: "/explore", params: { category: c.id } })}
                testID={`category-${c.id}`}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                  minHeight: 48,
                  paddingHorizontal: spacing.md,
                  borderRadius: radii.control,
                  backgroundColor: pressed ? neutrals.divider : colors.blueTint,
                })}
              >
                <Feather name={iconFor(c.name)} size={18} color={colors.blue} accessible={false} />
                <Text variant="bodyStrong">{c.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <NextLiveCard />
    </Screen>
  );
}
