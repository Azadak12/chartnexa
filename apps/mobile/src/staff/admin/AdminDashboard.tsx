import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { View } from "react-native";
import type { AccessResponse } from "@chartnexa/api-contracts";
import { canCreateCourses, canInviteInstructors, canManageCourses } from "../../courses/course-api";
import { CountUp } from "../../kit/CountUp";
import { Grid } from "../../kit/Grid";
import { PressableCard } from "../../kit/PressableCard";
import { accents, colors, raised, MIN_TOUCH_SIZE, neutrals, radii, spacing } from "../../theme";
import type { AccentName } from "@chartnexa/design-tokens";
import { Screen, Skeleton, Text } from "../../ui";
import { dashboardGroups, type DashboardTile, type Icon } from "../groups";
import { useAcademyMetrics, type Metric } from "../metrics";
import { StudioHeader } from "../../kit/StudioHeader";

/** An icon in a soft coloured square. The colour is never the only cue: words always sit beside it. */
function IconBadge({ icon, accent, size = 40 }: { icon: Icon; accent: AccentName; size?: number }) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: radii.control,
        backgroundColor: accents[accent].tint,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Feather name={icon} size={Math.round(size * 0.5)} color={accents[accent].ink} />
    </View>
  );
}

const VALUE_STYLE = { fontSize: 28, lineHeight: 34 } as const;
function ValueText({ value, animate, muted }: { value: string; animate: boolean; muted: boolean }) {
  const style = { ...VALUE_STYLE, color: muted ? neutrals.muted : colors.ink };
  return animate ? (
    <CountUp value={value} variant="title" style={style} />
  ) : (
    <Text variant="title" style={style}>
      {value}
    </Text>
  );
}

export function SectionHeader({ title, caption }: { title: string; caption?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="subheading" accessibilityRole="header">
        {title}
      </Text>
      {caption ? (
        <Text variant="caption" tone="muted">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One academy number. Its height follows its content (icon, value, label), so it is as tall as it
 * needs to be and no taller; a value that is still loading shows a skeleton, a failed one says so
 * and retries when pressed, and one with a screen behind it opens that screen.
 */
export function StatTile({
  label,
  accent,
  icon,
  metric,
  route,
  testID,
  animate = false,
}: {
  label: string;
  accent: AccentName;
  icon: Icon;
  metric: Metric;
  route: string;
  testID?: string;
  /** Count the number up when it first arrives and after a refresh. */
  animate?: boolean;
}) {
  const router = useRouter();
  const failed = metric.status === "error";
  const hint = failed ? "Could not load. Tap to try again." : "Opens the full list";
  return (
    <PressableCard
      testID={testID}
      accessibilityLabel={`${label}: ${failed ? "unavailable" : metric.status === "pending" ? "loading" : metric.value}`}
      accessibilityHint={hint}
      onPress={() => (failed ? metric.retry() : router.push(route as never))}
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        ...raised,
      }}
      pressedStyle={{ backgroundColor: accents[accent].tint }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <IconBadge icon={icon} accent={accent} size={36} />
        <Feather name="arrow-up-right" size={16} color={neutrals.muted} accessible={false} />
      </View>
      <View style={{ minHeight: 36, justifyContent: "center" }}>
        {metric.status === "pending" ? (
          <Skeleton height={28} />
        ) : (
          <ValueText
            value={failed ? "—" : metric.value}
            animate={animate && !failed}
            muted={failed}
          />
        )}
      </View>
      <Text variant="caption" tone={failed ? "error" : "muted"}>
        {failed ? `${label}. Could not load, tap to retry` : label}
      </Text>
    </PressableCard>
  );
}

export function QuickAction({
  label,
  icon,
  accent,
  onPress,
}: {
  label: string;
  icon: Icon;
  accent: AccentName;
  onPress: () => void;
}) {
  return (
    <PressableCard
      testID={`quick-${label}`}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        alignItems: "center",
        gap: spacing.xs,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.sm,
        minHeight: 84,
        borderRadius: radii.card,
        backgroundColor: accents[accent].tint,
      }}
    >
      <Feather name={icon} size={22} color={accents[accent].ink} accessible={false} />
      <Text variant="caption" style={{ textAlign: "center", color: colors.ink }}>
        {label}
      </Text>
    </PressableCard>
  );
}

/** A management entry: icon, title, a line about it and a chevron, with a comfortable touch area. */
export function NavCard({
  tile,
  accent,
  onPress,
}: {
  tile: DashboardTile;
  accent: AccentName;
  onPress: () => void;
}) {
  return (
    <PressableCard
      testID={`tile-${tile.label}`}
      accessibilityLabel={`${tile.label}. ${tile.hint}`}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: Math.max(64, MIN_TOUCH_SIZE),
        padding: spacing.md,
        ...raised,
      }}
      pressedStyle={{ backgroundColor: neutrals.surface }}
    >
      <IconBadge icon={tile.icon} accent={accent} size={44} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong">{tile.label}</Text>
        <Text variant="caption" tone="muted">
          {tile.hint}
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color={neutrals.muted} accessible={false} />
    </PressableCard>
  );
}

/** Which colour each entry wears. Variety helps scanning; the labels carry the meaning. */
export const ACCENT_FOR: Record<string, AccentName> = {
  Courses: "sky",
  Categories: "purple",
  "Students and access": "emerald",
  Instructors: "blue",
  Permissions: "purple",
  Announcements: "sky",
  "Review moderation": "amber",
  Orders: "emerald",
  "Audit log": "blue",
};
export const CAPTION_FOR: Record<string, string> = {
  "Courses and teaching": "Build and organise what students learn",
  People: "Invite and manage the teaching team",
  "Community and operations": "Keep the academy running smoothly",
};
export const TITLE_FOR: Record<string, string> = {
  "Courses and teaching": "Course management",
  People: "People management",
  "Community and operations": "Community and operations",
};

/**
 * The Admin dashboard: header, academy numbers, quick actions, then the management sections. All
 * numbers come from the real lists, and every entry opens the screen it always opened.
 */
export function AdminDashboard({ access }: { access: AccessResponse }) {
  const router = useRouter();
  const m = useAcademyMetrics(access);
  const groups = dashboardGroups(access);
  type Quick = { label: string; icon: Icon; accent: AccentName; route: string; show: boolean };
  const allQuick: Quick[] = [
    {
      label: "New course",
      icon: "plus-circle",
      accent: "sky",
      route: "/manage/new",
      show: canCreateCourses(access),
    },
    {
      label: "Invite instructor",
      icon: "user-plus",
      accent: "blue",
      route: "/profile/invitations",
      show: canInviteInstructors(access),
    },
    {
      label: "Manage courses",
      icon: "layers",
      accent: "purple",
      route: "/manage",
      show: canManageCourses(access),
    },
  ];
  const quick = allQuick.filter((q) => q.show);

  return (
    <Screen onRefresh={() => m.refetchAll()}>
      <StudioHeader
        testID="admin-header"
        title="Admin Dashboard"
        subtitle="Manage your academy at a glance."
      />

      {m.courses || m.people ? (
        <View style={{ gap: spacing.md }} testID="academy-stats">
          <SectionHeader title="Academy at a glance" />
          <Grid>
            {m.people ? (
              <StatTile
                testID="metric-Pending invitations"
                label="Pending invitations"
                icon="clock"
                accent="amber"
                metric={m.pending}
                route="/profile/invitations"
              />
            ) : null}
            {m.people ? (
              <StatTile
                testID="metric-Instructors"
                label="Instructors"
                icon="users"
                accent="blue"
                metric={m.instructors}
                route="/profile/invitations"
              />
            ) : null}
            {m.courses ? (
              <StatTile
                testID="metric-Published courses"
                label="Published courses"
                icon="check-circle"
                accent="emerald"
                metric={m.published}
                route="/manage"
              />
            ) : null}
            {m.courses ? (
              <StatTile
                testID="metric-Draft courses"
                label="Draft courses"
                icon="edit-3"
                accent="purple"
                metric={m.drafts}
                route="/manage"
              />
            ) : null}
          </Grid>
        </View>
      ) : null}

      {quick.length > 0 ? (
        <View style={{ gap: spacing.md }} testID="quick-actions">
          <SectionHeader title="Quick actions" />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            {quick.map((q) => (
              <View key={q.label} style={{ flex: 1, minWidth: 0 }}>
                <QuickAction
                  label={q.label}
                  icon={q.icon}
                  accent={q.accent}
                  onPress={() => router.push(q.route as never)}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {groups.map((g) => {
        const tiles = g.tiles.filter((t) => t.show);
        if (tiles.length === 0) return null;
        return (
          <View key={g.title} style={{ gap: spacing.md }} testID={`section-${g.title}`}>
            <SectionHeader title={TITLE_FOR[g.title] ?? g.title} caption={CAPTION_FOR[g.title]} />
            <View style={{ gap: spacing.sm }}>
              {tiles.map((t) => (
                <NavCard
                  key={t.label}
                  tile={t}
                  accent={ACCENT_FOR[t.label] ?? "blue"}
                  onPress={() => router.push(t.route as never)}
                />
              ))}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}
