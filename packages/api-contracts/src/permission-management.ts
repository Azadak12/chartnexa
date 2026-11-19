import { z } from "zod";
import { REASON_MAX, REASON_MIN } from "./access.js";

/** Never switchable through individual checkboxes or role defaults (decision Q38). */
export const RESTRICTED_PERMISSION_LIST = [
  "roles:manage",
  "audit:read",
  "payments:read_full",
  "instructor_permissions:manage",
] as const;

export const MANAGED_ROLES = ["instructor", "manager", "student"] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];

export type PermissionScope = "academy" | "course" | "global";
export interface CatalogEntry {
  permission: string;
  label: string;
  help: string;
  scope: PermissionScope;
}

/**
 * Plain-language names for every permission an Admin can switch. A permission may cover more
 * than one thing today: lesson:upload is lessons, videos and PDFs together, and assignments:manage
 * is creating assignments and reviewing submissions together.
 */
export const PERMISSION_CATALOG: readonly CatalogEntry[] = [
  {
    permission: "course:create",
    label: "Create courses",
    help: "Start new courses. The creator is given working access to their own course, never publishing.",
    scope: "academy",
  },
  {
    permission: "course:update",
    label: "Edit assigned courses",
    help: "Change title, description, price and settings of the course.",
    scope: "course",
  },
  {
    permission: "course:publish",
    label: "Publish courses",
    help: "Make the course visible to students, or take it down.",
    scope: "course",
  },
  {
    permission: "lesson:upload",
    label: "Lessons, videos and PDFs",
    help: "Create and edit lessons; upload and manage videos and PDF files.",
    scope: "course",
  },
  {
    permission: "live:schedule",
    label: "Live classes",
    help: "Schedule, edit, cancel and start live classes.",
    scope: "course",
  },
  {
    permission: "assignments:manage",
    label: "Assignments and submissions",
    help: "Create assignments and review student submissions.",
    scope: "course",
  },
  {
    permission: "students:read",
    label: "View enrolled students",
    help: "See who is enrolled in the course.",
    scope: "course",
  },
  {
    permission: "reports:read",
    label: "Course reports",
    help: "See reports for the course.",
    scope: "course",
  },
  {
    permission: "reviews:write",
    label: "Write course reviews",
    help: "Rate and review courses the person owns.",
    scope: "global",
  },
  {
    permission: "users:read",
    label: "View people",
    help: "See the list of accounts.",
    scope: "global",
  },
  {
    permission: "categories:manage",
    label: "Manage categories",
    help: "Create and edit course categories.",
    scope: "global",
  },
  {
    permission: "enrollments:manage",
    label: "Manage enrollments",
    help: "Give or take away a student's access to a course.",
    scope: "global",
  },
  {
    permission: "reviews:moderate",
    label: "Moderate reviews",
    help: "Hide and restore reviews, decide appeals.",
    scope: "global",
  },
  {
    permission: "payments:read_status",
    label: "See payment status",
    help: "See whether an order was paid (no card or amount details).",
    scope: "global",
  },
  {
    permission: "announcements:publish",
    label: "Publish announcements",
    help: "Post announcements to students.",
    scope: "global",
  },
  {
    permission: "instructors:invite",
    label: "Invite instructors",
    help: "Send instructor invitations.",
    scope: "global",
  },
];

/** Manager built-ins that are shown by their catalog entry (course permissions apply academy-wide). */
export const COURSE_PERMISSION_LIST = PERMISSION_CATALOG.filter((c) => c.scope === "course").map(
  (c) => c.permission,
);

export function catalogEntry(permission: string): CatalogEntry | undefined {
  return PERMISSION_CATALOG.find((c) => c.permission === permission);
}

const reason = z.string().trim().min(REASON_MIN).max(REASON_MAX);
const permissionName = z.string().min(3).max(60);

export const managedRoleSchema = z.enum(MANAGED_ROLES);

export const permissionUsersQuerySchema = z.strictObject({
  role: managedRoleSchema,
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().max(200).optional(),
});
export type PermissionUsersQuery = z.infer<typeof permissionUsersQuerySchema>;

export const permissionUserSummarySchema = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  role: managedRoleSchema,
  status: z.string(),
});
export type PermissionUserSummary = z.infer<typeof permissionUserSummarySchema>;
export interface PermissionUsersPage {
  items: PermissionUserSummary[];
  nextCursor: string | null;
}

export type PermissionSource = "role" | "individual" | "switched_off" | "none";

export interface PermissionRow {
  permission: string;
  label: string;
  help: string;
  scope: PermissionScope;
  /** What the person can do right now. Course-scoped rows for an Instructor are in courseGrants. */
  enabled: boolean;
  source: PermissionSource;
  /** True when the person's role gives this permission to everyone with the role. */
  roleDefault: boolean;
  expiresAt: string | null;
  reason: string | null;
  changeable: boolean;
  lockedReason: string | null;
}

export interface CourseGrantRow {
  id: string;
  permission: string;
  courseId: string;
  courseTitle: string;
  source: "manual" | "owner_auto";
  reason: string;
  grantedAt: string;
  expiresAt: string | null;
}

export interface CourseAccessRow {
  entitlementId: string;
  courseId: string;
  courseTitle: string;
  source: string;
  grantedAt: string;
}

export interface PermissionUserDetail {
  user: PermissionUserSummary;
  /** Send back with a save; a stale version is refused so two Admins never overwrite each other. */
  version: number;
  permissions: PermissionRow[];
  /** Instructors only. */
  courseGrants: CourseGrantRow[];
  availableCourses: Array<{ id: string; title: string }>;
  /** Students only: read-only here; purchases and enrollments are managed on the course. */
  courseAccess: CourseAccessRow[];
  restricted: string[];
}

const isoFuture = z
  .string()
  .datetime({ offset: true })
  .refine((v) => new Date(v).getTime() > Date.now(), "Choose a date in the future");

export const permissionChangeSchema = z.strictObject({
  permission: permissionName,
  courseId: z.uuid().optional(),
  enabled: z.boolean(),
  expiresAt: isoFuture.nullable().optional(),
});
export type PermissionChange = z.infer<typeof permissionChangeSchema>;

export const savePermissionsRequestSchema = z.strictObject({
  reason,
  expectedVersion: z.number().int().min(0),
  changes: z.array(permissionChangeSchema).min(1).max(40),
});
export type SavePermissionsRequest = z.infer<typeof savePermissionsRequestSchema>;

export interface RoleDefaultsEntry {
  role: ManagedRole;
  permissions: Array<{
    permission: string;
    label: string;
    help: string;
    builtIn: boolean;
    enabled: boolean;
  }>;
}
export interface RoleDefaultsResponse {
  roles: RoleDefaultsEntry[];
}

export const saveRoleDefaultsRequestSchema = z.strictObject({
  reason,
  changes: z
    .array(z.strictObject({ permission: permissionName, enabled: z.boolean() }))
    .min(1)
    .max(40),
});
export type SaveRoleDefaultsRequest = z.infer<typeof saveRoleDefaultsRequestSchema>;
