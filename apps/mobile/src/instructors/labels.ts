import type { GrantablePermission } from "@chartnexa/api-contracts";

/** Plain-language names. Items not built yet say so, so nobody expects a screen that is not there. */
export const PERMISSION_LABEL: Record<GrantablePermission, string> = {
  "course:create": "Create new courses",
  "course:update": "Edit course details",
  "course:publish": "Publish and unpublish courses",
  "lesson:upload": "Upload lessons (not available yet)",
  "live:schedule": "Schedule live sessions (not available yet)",
  "students:read": "See enrolled students (not available yet)",
  "reports:read": "See course reports (not available yet)",
};

export const labelFor = (p: string): string => (PERMISSION_LABEL as Record<string, string>)[p] ?? p;
