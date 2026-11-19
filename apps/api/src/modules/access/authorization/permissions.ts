export type Role = "student" | "instructor" | "manager" | "admin";
export const STAFF_ROLES = ["instructor", "manager", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * Every permission, with where it can apply. `course` permissions can later be granted for a
 * single course; `global` ones are role-only. The `...:assigned` wording in docs/02 is
 * expressed as a course-scoped grant of the plain permission.
 */
export const PERMISSION_SCOPES = {
  "roles:manage": "global",
  "audit:read": "global",
  "users:read": "global",
  "instructor_permissions:manage": "global",
  "course:create": "global",
  "categories:manage": "global",
  "course:update": "course",
  "course:publish": "course",
  "lesson:upload": "course",
  "live:schedule": "course",
  "assignments:manage": "course",
  "students:read": "course",
  "enrollments:manage": "global",
  "reports:read": "course",
  "reviews:moderate": "global",
  "payments:read_status": "global",
  "payments:read_full": "global",
  "announcements:publish": "global",
  "instructors:invite": "global",
  "reviews:write": "global",
} as const;

export type Permission = keyof typeof PERMISSION_SCOPES;
export const ALL_PERMISSIONS = Object.keys(PERMISSION_SCOPES) as Permission[];

/**
 * Which roles hold each permission by default. The Record type forces a decision for every
 * catalog entry: adding a permission without an entry here fails to compile.
 * Manager defaults are a proposal awaiting owner approval (decision register R03).
 */
export const PERMISSION_HOLDERS: Record<Permission, readonly Role[]> = {
  "roles:manage": ["admin"],
  "audit:read": ["admin"],
  "users:read": ["admin", "manager"],
  // Q38: for now only Admins grant or revoke individual permissions.
  "instructor_permissions:manage": ["admin"],
  "course:create": ["admin", "manager"],
  "categories:manage": ["admin", "manager"],
  "course:update": ["admin", "manager"],
  "course:publish": ["admin", "manager"],
  "lesson:upload": ["admin", "manager"],
  "live:schedule": ["admin", "manager"],
  // R41 proposal: create, publish and assign coursework, and give feedback on submissions.
  "assignments:manage": ["admin", "manager"],
  "students:read": ["admin", "manager"],
  "enrollments:manage": ["admin", "manager"],
  "reports:read": ["admin", "manager"],
  "reviews:moderate": ["admin", "manager"],
  "payments:read_status": ["admin", "manager"],
  "payments:read_full": ["admin"],
  // R39 proposal: Admins and Managers post academy-wide and course announcements.
  "announcements:publish": ["admin", "manager"],
  // R40 proposal: Admins and Managers invite Instructors; only Admins deactivate them (roles:manage).
  "instructors:invite": ["admin", "manager"],
  // Writing a course review. Switchable per person or per role (Admin permission management).
  // Everyone is a Student, so the Student role carries it; staff get it through that.
  "reviews:write": ["admin", "student"],
};

/**
 * Never switchable through individual checkboxes or role defaults (decision Q38). The same four
 * names are in the CHECK constraints of role_permission_defaults and user_permission_denials.
 */
export const RESTRICTED_PERMISSIONS: readonly Permission[] = [
  "roles:manage",
  "audit:read",
  "payments:read_full",
  "instructor_permissions:manage",
];

export const CONFIGURABLE_ROLES = ["manager", "instructor", "student"] as const;
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

/**
 * What an Admin may switch for a whole role. A Manager's built-in permissions can be switched
 * off or back on. Instructors and Students may only gain permissions listed here: academy-wide
 * ones, never a course permission (those stay tied to explicitly assigned courses).
 */
export function configurablePermissionsForRole(role: ConfigurableRole): Permission[] {
  if (role === "manager") {
    return permissionsForRole("manager").filter((p) => !RESTRICTED_PERMISSIONS.includes(p));
  }
  if (role === "instructor") return ["course:create"];
  return ["reviews:write"];
}

/** The role's built-in answer, before any Admin override. */
export function builtInHolds(role: Role, permission: Permission): boolean {
  return PERMISSION_HOLDERS[permission].includes(role);
}

export function permissionsForRole(role: Role): Permission[] {
  return ALL_PERMISSIONS.filter((p) => PERMISSION_HOLDERS[p].includes(role));
}

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}
