import type { AccessResponse } from "@chartnexa/api-contracts";

export type RoleKind = "student" | "instructor" | "manager" | "admin";
export interface TabSpec {
  name: string;
  title: string;
  icon:
    | "home"
    | "search"
    | "book-open"
    | "clipboard"
    | "grid"
    | "user"
    | "users"
    | "mail"
    | "more-horizontal";
}

/** The highest role wins: someone who is both a student and an instructor gets the instructor bar. */
export function roleOf(a: AccessResponse | undefined): RoleKind {
  const roles = a?.roles ?? [];
  if (roles.includes("admin")) return "admin";
  if (roles.includes("manager")) return "manager";
  if (roles.includes("instructor")) return "instructor";
  return "student";
}

const STUDENT: TabSpec[] = [
  { name: "home", title: "Home", icon: "home" },
  { name: "explore", title: "Explore", icon: "search" },
  { name: "courses", title: "My Learning", icon: "book-open" },
  { name: "assignments", title: "Assignments", icon: "clipboard" },
  { name: "profile", title: "Profile", icon: "user" },
];
const INSTRUCTOR: TabSpec[] = [
  { name: "dashboard", title: "Dashboard", icon: "grid" },
  { name: "staff-courses", title: "Courses", icon: "book-open" },
  { name: "staff-assignments", title: "Assignments", icon: "clipboard" },
  { name: "profile", title: "Profile", icon: "user" },
];
const ADMIN: TabSpec[] = [
  { name: "dashboard", title: "Dashboard", icon: "grid" },
  { name: "users", title: "Users", icon: "users" },
  { name: "staff-courses", title: "Courses", icon: "book-open" },
  { name: "more", title: "More", icon: "more-horizontal" },
];
const MANAGER: TabSpec[] = [
  { name: "dashboard", title: "Dashboard", icon: "grid" },
  { name: "invitations", title: "Invitations", icon: "mail" },
  { name: "profile", title: "Profile", icon: "user" },
];

/** The tabs a role sees, in order. Every other tab exists but is hidden. The server still checks each call. */
export function tabsFor(role: RoleKind): TabSpec[] {
  return role === "admin"
    ? ADMIN
    : role === "manager"
      ? MANAGER
      : role === "instructor"
        ? INSTRUCTOR
        : STUDENT;
}

/**
 * Every tab route in one fixed order. Changing the order of screens after sign-in would reset the
 * navigator, so the order never changes; it is chosen so that each role's tabs, filtered from it,
 * come out in that role's order.
 */
export const ALL_TAB_NAMES = [
  "dashboard",
  "users",
  "invitations",
  "staff-courses",
  "staff-assignments",
  "home",
  "explore",
  "courses",
  "assignments",
  "more",
  "profile",
] as const;
