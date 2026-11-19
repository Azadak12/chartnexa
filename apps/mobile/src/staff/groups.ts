import type { Feather } from "@expo/vector-icons";
import type { AccessResponse } from "@chartnexa/api-contracts";
import {
  canInviteInstructors,
  canManageCategories,
  canManageCourses,
  canManageEnrollments,
  canModerateReviews,
  canPublishAnnouncements,
  canReadAudit,
  canReadPayments,
} from "../courses/course-api";

export type Icon = React.ComponentProps<typeof Feather>["name"];
export interface DashboardTile {
  label: string;
  hint: string;
  icon: Icon;
  route: string;
  show: boolean;
}
export interface DashboardGroup {
  title: string;
  tiles: DashboardTile[];
}

/** What a role's dashboard offers, from its permissions. Each entry opens a real screen. */
export function dashboardGroups(a: AccessResponse): DashboardGroup[] {
  return [
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
}
