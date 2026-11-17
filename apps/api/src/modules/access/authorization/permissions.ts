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
  "course:update": "course",
  "course:publish": "course",
  "lesson:upload": "course",
  "live:schedule": "course",
  "students:read": "course",
  "enrollments:manage": "global",
  "reports:read": "course",
  "reviews:moderate": "global",
  "payments:read_status": "global",
  "payments:read_full": "global",
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
  "instructor_permissions:manage": ["admin", "manager"],
  "course:create": ["admin", "manager"],
  "course:update": ["admin", "manager"],
  "course:publish": ["admin", "manager"],
  "lesson:upload": ["admin", "manager"],
  "live:schedule": ["admin", "manager"],
  "students:read": ["admin", "manager"],
  "enrollments:manage": ["admin", "manager"],
  "reports:read": ["admin", "manager"],
  "reviews:moderate": ["admin", "manager"],
  "payments:read_status": ["admin", "manager"],
  "payments:read_full": ["admin"],
};

export function permissionsForRole(role: Role): Permission[] {
  return ALL_PERMISSIONS.filter((p) => PERMISSION_HOLDERS[p].includes(role));
}

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}
