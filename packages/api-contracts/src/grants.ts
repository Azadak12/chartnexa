import { z } from "zod";
import { REASON_MAX, REASON_MIN } from "./access.js";

/** Permissions that can be granted to an Instructor, and where each applies. */
export const GRANTABLE_PERMISSIONS = {
  "course:create": "academy",
  "course:update": "course",
  "course:publish": "course",
  "lesson:upload": "course",
  "live:schedule": "course",
  "students:read": "course",
  "reports:read": "course",
} as const;
export type GrantablePermission = keyof typeof GRANTABLE_PERMISSIONS;
export const GRANTABLE_LIST = Object.keys(GRANTABLE_PERMISSIONS) as GrantablePermission[];
export const grantablePermissionSchema = z.enum(
  GRANTABLE_LIST as [GrantablePermission, ...GrantablePermission[]],
);

const reason = z.string().trim().min(REASON_MIN).max(REASON_MAX);

export const grantRequestSchema = z
  .strictObject({
    permission: grantablePermissionSchema,
    courseId: z.uuid().optional(),
    reason,
  })
  .superRefine((v, ctx) => {
    const scope = GRANTABLE_PERMISSIONS[v.permission];
    if (scope === "course" && !v.courseId) {
      ctx.addIssue({ code: "custom", path: ["courseId"], message: "Choose a course" });
    }
    if (scope === "academy" && v.courseId) {
      ctx.addIssue({
        code: "custom",
        path: ["courseId"],
        message: "This permission applies to the whole academy, not one course",
      });
    }
  });
export const revokeGrantRequestSchema = z.strictObject({ reason });

export const grantSchema = z.object({
  id: z.string(),
  permission: grantablePermissionSchema,
  courseId: z.string().nullable(),
  courseTitle: z.string().nullable(),
  source: z.enum(["manual", "owner_auto"]),
  reason: z.string(),
  grantedAt: z.string(),
});
export const instructorPermissionsResponseSchema = z.object({
  userId: z.string(),
  displayName: z.string().nullable(),
  grants: z.array(grantSchema),
  grantable: z.array(
    z.object({
      permission: grantablePermissionSchema,
      scope: z.enum(["academy", "course"]),
      allowedForYou: z.boolean(),
    }),
  ),
});
export const grantResponseSchema = z.object({ grant: grantSchema, created: z.boolean() });

export type GrantRequest = z.infer<typeof grantRequestSchema>;
export type RevokeGrantRequest = z.infer<typeof revokeGrantRequestSchema>;
export type Grant = z.infer<typeof grantSchema>;
export type InstructorPermissionsResponse = z.infer<typeof instructorPermissionsResponseSchema>;
export type GrantResponse = z.infer<typeof grantResponseSchema>;
