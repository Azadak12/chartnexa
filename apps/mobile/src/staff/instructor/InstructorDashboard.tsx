import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import type { AccessResponse } from "@chartnexa/api-contracts";
import { accountApi } from "../../auth/account-api";
import { canCreateCourses, canManageCourses } from "../../courses/course-api";
import { courseShortcuts } from "../../courses/course-shortcuts";
import { CourseManageCard } from "../../kit/CourseManageCard";
import { Grid } from "../../kit/Grid";
import { Reveal } from "../../kit/Reveal";
import { CourseCardSkeleton, StudioEmpty } from "../../kit/StudioEmpty";
import { HEADER_ART } from "../../kit/header-art";
import { StudioHeader } from "../../kit/StudioHeader";
import { accents, spacing } from "../../theme";
import { Screen, Text } from "../../ui";
import { NavCard, QuickAction, SectionHeader, StatTile } from "../admin/AdminDashboard";
import { dashboardGroups } from "../groups";
import { useAcademyMetrics } from "../metrics";

const PREVIEW_COUNT = 3;

/** "Welcome back, Dana" from the signed-in account's name, or nothing when it has none. */
export function greetingLine(name: string | null | undefined): string | undefined {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Welcome back, ${first}` : undefined;
}

/**
 * Instructor Studio, for Instructor and Lecturer alike: what each sees comes from their own
 * permissions, so the lists are theirs. The numbers and the "Your courses" previews come from the
 * same two real requests, and the entrance animation costs none.
 */
export function InstructorDashboard({ access }: { access: AccessResponse }) {
  const router = useRouter();
  const me = useQuery({ queryKey: ["me"], queryFn: accountApi.me });
  const m = useAcademyMetrics(access);
  const canList = canManageCourses(access);
  const others = dashboardGroups(access)
    .flatMap((g) => g.tiles)
    .filter((t) => t.show && t.label !== "Courses");
  const loading = m.published.status === "pending" || m.drafts.status === "pending";
  const failed = m.published.status === "error" && m.drafts.status === "error";
  const previews = m.courseItems.slice(0, PREVIEW_COUNT);

  return (
    <Screen onRefresh={() => m.refetchAll()}>
      <Reveal index={0}>
        <StudioHeader
          testID="studio-header"
          art={HEADER_ART.instructor}
          title="Instructor Studio"
          subtitle="Manage your courses and teaching content."
          greeting={greetingLine(me.data?.displayName)}
        />
      </Reveal>

      {canList ? (
        <Reveal index={1}>
          <View style={{ gap: spacing.md }} testID="academy-stats">
            <SectionHeader title="Your courses at a glance" />
            <Grid>
              <StatTile
                animate
                testID="metric-Published courses"
                label="Published courses"
                icon="check-circle"
                accent="emerald"
                metric={m.published}
                route="/manage?status=published"
              />
              <StatTile
                animate
                testID="metric-Draft courses"
                label="Draft courses"
                icon="edit-3"
                accent="amber"
                metric={m.drafts}
                route="/manage?status=draft"
              />
            </Grid>
          </View>
        </Reveal>
      ) : null}

      <Reveal index={2}>
        <View style={{ gap: spacing.md }} testID="quick-actions">
          <SectionHeader title="Quick actions" />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            {canCreateCourses(access) ? (
              <View style={{ flex: 1, minWidth: 0 }}>
                <QuickAction
                  label="New course"
                  icon="plus-circle"
                  accent="sky"
                  onPress={() => router.push("/manage/new")}
                />
              </View>
            ) : null}
            {canList ? (
              <View style={{ flex: 1, minWidth: 0 }}>
                <QuickAction
                  label="Manage courses"
                  icon="layers"
                  accent="purple"
                  onPress={() => router.push("/manage")}
                />
              </View>
            ) : null}
          </View>
        </View>
      </Reveal>

      {canList ? (
        <Reveal index={3}>
          <View style={{ gap: spacing.md }} testID="your-courses">
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing.md,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <SectionHeader
                  title="Your courses"
                  caption="The ones you teach, most recent first"
                />
              </View>
              <Pressable
                testID="tile-Courses"
                accessibilityRole="button"
                accessibilityLabel="Courses. Open the full list"
                onPress={() => router.push("/manage")}
                hitSlop={8}
                style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 2 }}
              >
                <Text variant="bodyStrong" tone="link">
                  See all
                </Text>
                <Feather
                  name="chevron-right"
                  size={18}
                  color={accents.blue.ink}
                  accessible={false}
                />
              </Pressable>
            </View>
            {loading ? (
              <View style={{ gap: spacing.sm }}>
                <CourseCardSkeleton />
                <CourseCardSkeleton />
              </View>
            ) : failed ? (
              <StudioEmpty
                icon="wifi-off"
                title="Courses could not be loaded"
                message="Check your connection and try again."
                actionLabel="Try again"
                onAction={() => void m.refetchAll()}
                testID="courses-error"
              />
            ) : previews.length === 0 ? (
              <StudioEmpty
                title="No courses yet"
                message={
                  canCreateCourses(access)
                    ? "Create your first course and it will appear here."
                    : "Courses you are given access to will appear here."
                }
                actionLabel={canCreateCourses(access) ? "New course" : undefined}
                onAction={canCreateCourses(access) ? () => router.push("/manage/new") : undefined}
                testID="courses-empty"
              />
            ) : (
              <View style={{ gap: spacing.sm }}>
                {previews.map((c) => (
                  <CourseManageCard
                    key={c.id}
                    course={c}
                    testID={`preview-course-${c.id}`}
                    onPress={() => router.push(`/manage/${c.id}`)}
                    actions={courseShortcuts(access, c.id, (p) => router.push(p as never))}
                  />
                ))}
              </View>
            )}
          </View>
        </Reveal>
      ) : null}

      {others.length > 0 ? (
        <Reveal index={4}>
          <View style={{ gap: spacing.md }}>
            <SectionHeader title="Teaching tools" />
            <View style={{ gap: spacing.sm }}>
              {others.map((t) => (
                <NavCard
                  key={t.label}
                  tile={t}
                  accent="blue"
                  onPress={() => router.push(t.route as never)}
                />
              ))}
            </View>
          </View>
        </Reveal>
      ) : null}
    </Screen>
  );
}
