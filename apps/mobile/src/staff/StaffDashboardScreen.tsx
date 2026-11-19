import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { isAppError, messageFor } from "../api/errors";
import {
  canInviteInstructors,
  canManageCategories,
  canManageCourses,
  canManageEnrollments,
  canModerateReviews,
  canPublishAnnouncements,
  canReadAudit,
  canReadPayments,
  fetchAccess,
  isStaff,
  staffCourseApi,
} from "../courses/course-api";
import type { AccessResponse } from "@chartnexa/api-contracts";
import { invitationApi } from "../invitations/invitation-api";
import { DashboardMetricCard } from "../kit/Rows";
import { shouldRetry } from "../state/query-client";
import { StateView } from "../state/StateView";
import { colors, neutrals, radii, spacing } from "../theme";
import { Screen, Text } from "../ui";

type Icon = React.ComponentProps<typeof Feather>["name"];
interface Tile {
  label: string;
  hint: string;
  icon: Icon;
  route: string;
  show: boolean;
}

/** A role-aware home for staff. Each tile opens a real screen; the server still checks every call. */
/** A count from one page of real results: "25+" when there are more pages than were loaded. */
const countText = (n: number, more: boolean) => (more ? `${n}+` : String(n));

function Metrics({ a }: { a: AccessResponse }) {
  const router = useRouter();
  const courses = canManageCourses(a);
  const people = canInviteInstructors(a);
  const published = useQuery({
    queryKey: ["metric-courses", "published"],
    enabled: courses,
    queryFn: () => staffCourseApi.list({ status: "published" }),
    retry: shouldRetry,
  });
  const drafts = useQuery({
    queryKey: ["metric-courses", "draft"],
    enabled: courses,
    queryFn: () => staffCourseApi.list({ status: "draft" }),
    retry: shouldRetry,
  });
  const instructors = useQuery({
    queryKey: ["metric-instructors"],
    enabled: people,
    queryFn: () => invitationApi.instructors(),
    retry: shouldRetry,
  });
  const pending = useQuery({
    queryKey: ["metric-invitations", "pending"],
    enabled: people,
    queryFn: () => invitationApi.list("pending"),
    retry: shouldRetry,
  });
  const cards: {
    label: string;
    q: { status: string; data?: unknown };
    value: string;
    route: string;
    icon: Icon;
  }[] = [];
  if (people) {
    cards.push({
      label: "Pending invitations",
      q: pending,
      value: pending.data ? countText(pending.data.items.length, !!pending.data.nextCursor) : "",
      route: "/profile/invitations",
      icon: "mail",
    });
    cards.push({
      label: "Instructors",
      q: instructors,
      value: instructors.data ? String(instructors.data.length) : "",
      route: "/profile/invitations",
      icon: "users",
    });
  }
  if (courses) {
    cards.push({
      label: "Published courses",
      q: published,
      value: published.data
        ? countText(published.data.items.length, !!published.data.nextCursor)
        : "",
      route: "/manage",
      icon: "book-open",
    });
    cards.push({
      label: "Draft courses",
      q: drafts,
      value: drafts.data ? countText(drafts.data.items.length, !!drafts.data.nextCursor) : "",
      route: "/manage",
      icon: "edit-3",
    });
  }
  if (cards.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }} testID="metrics">
      {cards.map((c) => (
        <DashboardMetricCard
          key={c.label}
          label={c.label}
          icon={c.icon}
          value={c.q.status === "error" ? "Unavailable" : c.q.status === "pending" ? "…" : c.value}
          testID={`metric-${c.label}`}
          onPress={() => router.push(c.route as never)}
        />
      ))}
    </View>
  );
}

export function StaffDashboardScreen() {
  const router = useRouter();
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  if (access.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (access.status === "error") {
    return (
      <Screen>
        <StateView
          state="error"
          message={isAppError(access.error) ? access.error.message : messageFor("unknown")}
          onAction={() => void access.refetch()}
        />
      </Screen>
    );
  }
  const a = access.data;
  if (!isStaff(a)) {
    return (
      <Screen>
        <StateView
          state="empty"
          title="Not available"
          message="The dashboard is for instructors, managers and admins."
        />
      </Screen>
    );
  }
  const role = a.roles.includes("admin")
    ? "Admin"
    : a.roles.includes("manager")
      ? "Manager"
      : "Instructor";
  const groups: { title: string; tiles: Tile[] }[] = [
    {
      title: "Courses and teaching",
      tiles: [
        {
          label: "Courses",
          hint: "Create, edit, add lessons, videos, files and assignments",
          icon: "book-open",
          route: "/manage",
          show: canManageCourses(a),
        },
        {
          label: "Categories",
          hint: "Organise the catalog",
          icon: "tag",
          route: "/manage/categories",
          show: canManageCategories(a),
        },
        {
          label: "Students and access",
          hint: "Open a course, then Students",
          icon: "users",
          route: "/manage",
          show: canManageEnrollments(a),
        },
      ],
    },
    {
      title: "People",
      tiles: [
        {
          label: "Instructors",
          hint: "Invite, manage and deactivate",
          icon: "user-plus",
          route: "/profile/invitations",
          show: canInviteInstructors(a),
        },
        {
          label: "Permissions",
          hint: "Per-course instructor access",
          icon: "key",
          route: "/profile/instructors",
          show: a.permissions.includes("instructor_permissions:manage"),
        },
      ],
    },
    {
      title: "Community and operations",
      tiles: [
        {
          label: "Announcements",
          hint: "Post news to everyone or one course",
          icon: "bell",
          route: "/profile/staff-announcements",
          show: canPublishAnnouncements(a),
        },
        {
          label: "Review moderation",
          hint: "Reports and appeals",
          icon: "shield",
          route: "/profile/reviews",
          show: canModerateReviews(a),
        },
        {
          label: "Orders",
          hint: "Payment status (test mode)",
          icon: "credit-card",
          route: "/profile/orders",
          show: canReadPayments(a),
        },
        {
          label: "Audit log",
          hint: "Who did what, and when",
          icon: "list",
          route: "/profile/audit",
          show: canReadAudit(a),
        },
      ],
    },
  ];
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {role} dashboard
      </Text>
      <Text tone="muted">
        Everything here uses real data. What you see depends on your permissions.
      </Text>
      <Metrics a={a} />
      {groups.map((g) => {
        const tiles = g.tiles.filter((t) => t.show);
        if (tiles.length === 0) return null;
        return (
          <View key={g.title} style={{ gap: spacing.sm }}>
            <Text variant="subheading" accessibilityRole="header">
              {g.title}
            </Text>
            {tiles.map((t) => (
              <Pressable
                key={t.label}
                accessibilityRole="button"
                accessibilityLabel={`${t.label}. ${t.hint}`}
                onPress={() => router.push(t.route as never)}
                testID={`tile-${t.label}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  borderWidth: 1,
                  borderColor: neutrals.divider,
                  borderRadius: radii.card,
                  padding: spacing.md,
                  backgroundColor: colors.white,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radii.control,
                    backgroundColor: colors.blueTint,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name={t.icon} size={22} color={colors.blue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="subheading">{t.label}</Text>
                  <Text variant="caption" tone="muted">
                    {t.hint}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={neutrals.muted} />
              </Pressable>
            ))}
          </View>
        );
      })}
    </Screen>
  );
}
