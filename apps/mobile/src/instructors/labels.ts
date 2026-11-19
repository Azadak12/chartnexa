import type { GrantablePermission } from "@chartnexa/api-contracts";

/** Plain-language names. Items not built yet say so, so nobody expects a screen that is not there. */
export const PERMISSION_LABEL: Record<GrantablePermission, string> = {
  "course:create": "Create new courses",
  "course:update": "Edit course details",
  "course:publish": "Publish and unpublish courses",
  "lesson:upload": "Add lessons, videos and files",
  "live:schedule": "Schedule live classes",
  "assignments:manage": "Create assignments and give feedback",
  "students:read": "See enrolled students",
  "reports:read": "See course reports (not available yet)",
};

export const labelFor = (p: string): string => (PERMISSION_LABEL as Record<string, string>)[p] ?? p;
