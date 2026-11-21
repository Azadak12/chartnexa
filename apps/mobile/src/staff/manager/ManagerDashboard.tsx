import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { View } from "react-native";
import type { AccessResponse } from "@chartnexa/api-contracts";
import type { AccentName } from "@chartnexa/design-tokens";
import { accountApi } from "../../auth/account-api";
import { canCreateCourses, canInviteInstructors, canManageCourses } from "../../courses/course-api";
import { SplitBar } from "../../kit/SplitBar";
import { Grid } from "../../kit/Grid";
import { Reveal } from "../../kit/Reveal";
import { HEADER_ART } from "../../kit/header-art";
import { StudioHeader } from "../../kit/StudioHeader";
import { colors, market, spacing } from "../../theme";
import { Screen } from "../../ui";
import {
  ACCENT_FOR,
  CAPTION_FOR,
  NavCard,
  QuickAction,
  SectionHeader,
  StatTile,
  TITLE_FOR,
} from "../admin/AdminDashboard";
import { dashboardGroups, type Icon } from "../groups";
import { useAcademyMetrics } from "../metrics";
import { greetingLine } from "../instructor/InstructorDashboard";

/** The Manager's own section names; the entries inside are the same ones as before. */
const MANAGER_TITLE: Record<string, string> = {
  ...TITLE_FOR,
  "Community and operations": "Community and operations",
};

/**
 * The Manager dashboard: the shared navy header, the four academy numbers, quick actions, and
 * the management sections. Everything is built from the Admin dashboard's components. What shows
 * comes from this account's own permissions (the Manager gets no Permissions or Audit entries,
 * because the server does not give them those permissions), and every number is a real request.
 */
export function ManagerDashboard({ access }: { access: AccessResponse }) {
  const router = useRouter();
  const me = useQuery({ queryKey: ["me"], queryFn: accountApi.me });
  const m = useAcademyMetrics(access);
  const groups = dashboardGroups(access);
  type Quick = { label: string; icon: Icon; accent: AccentName; route: string; show: boolean };
  const quick: Quick[] = (
    [
      {
        label: "Manage courses",
        icon: "layers",
        accent: "purple",
        route: "/manage",
        show: canManageCourses(access),
      },
      {
        label: "Invite instructor",
        icon: "user-plus",
        accent: "blue",
        route: "/profile/invitations",
        show: canInviteInstructors(access),
      },
      {
        label: "New course",
        icon: "plus-circle",
        accent: "sky",
        route: "/manage/new",
        show: canCreateCourses(access),
      },
    ] as Quick[]
  ).filter((q) => q.show);
  let index = 1;

  return (
    <Screen onRefresh={() => m.refetchAll()}>
      <Reveal index={0}>
        <StudioHeader
          testID="manager-header"
          art={HEADER_ART.manager}
          title="Manager Dashboard"
          subtitle="Your academy operations at a glance."
          greeting={greetingLine(me.data?.displayName)}
        />
      </Reveal>

      {m.courses || m.people ? (
        <Reveal index={index++}>
          <View style={{ gap: spacing.md }} testID="academy-stats">
            <SectionHeader title="Academy at a glance" />
            <Grid>
              {m.people ? (
                <StatTile
                  animate
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
                  animate
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
                  animate
                  testID="metric-Published courses"
                  label="Published courses"
                  icon="check-circle"
                  accent="emerald"
                  metric={m.published}
                  route="/manage?status=published"
                />
              ) : null}
              {m.courses ? (
                <StatTile
                  animate
                  testID="metric-Draft courses"
                  label="Draft courses"
                  icon="edit-3"
                  accent="purple"
                  metric={m.drafts}
                  route="/manage?status=draft"
                />
              ) : null}
            </Grid>
            {m.courses && m.published.exact !== undefined && m.drafts.exact !== undefined ? (
              <SplitBar
                testID="course-status-split"
                title="Courses by status"
                parts={[
                  { label: "Published", value: m.published.exact, color: market.up },
                  { label: "Draft", value: m.drafts.exact, color: colors.champagne },
                ]}
              />
            ) : null}
          </View>
        </Reveal>
      ) : null}

      {quick.length > 0 ? (
        <Reveal index={index++}>
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
        </Reveal>
      ) : null}

      {groups.map((g) => {
        const tiles = g.tiles.filter((t) => t.show);
        if (tiles.length === 0) return null;
        return (
          <Reveal key={g.title} index={index++}>
            <View style={{ gap: spacing.md }} testID={`section-${g.title}`}>
              <SectionHeader
                title={MANAGER_TITLE[g.title] ?? g.title}
                caption={CAPTION_FOR[g.title]}
              />
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
          </Reveal>
        );
      })}
    </Screen>
  );
}
