export const ROLES = ["student", "instructor", "manager", "admin"] as const;
export type Role = (typeof ROLES)[number];
