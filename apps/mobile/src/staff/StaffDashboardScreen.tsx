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
} from "../courses/course-api";
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
