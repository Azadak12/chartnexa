import {
  courseStudentSchema,
  entitlementSchema,
  grantEntitlementResponseSchema,
  myCourseSchema,
  type CourseStudent,
  type Entitlement,
  type GrantEntitlementResponse,
  type MyCourse,
  type Page,
} from "@chartnexa/api-contracts";
import { z } from "zod";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "../auth/authed-fetch";

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}

const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
const enc = encodeURIComponent;
const paging = (cursor?: string) => `?limit=25${cursor ? `&cursor=${enc(cursor)}` : ""}`;

/** The signed-in person's own courses. */
export const myCoursesApi = {
  async list(cursor?: string): Promise<Page<MyCourse>> {
    return check(pageOf(myCourseSchema), await authedFetch(`/me/courses${paging(cursor)}`));
  },
};

/** Staff calls (Admins and Managers); the server checks the permission on every request. */
export const staffEntitlementApi = {
  async list(courseId: string, cursor?: string): Promise<Page<CourseStudent>> {
    return check(
      pageOf(courseStudentSchema),
      await authedFetch(`/staff/courses/${enc(courseId)}/entitlements${paging(cursor)}`),
    );
  },
  async grant(courseId: string, userId: string, reason: string): Promise<GrantEntitlementResponse> {
    return check(
      grantEntitlementResponseSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/entitlements`, {
        method: "POST",
        body: { userId, reason },
      }),
    );
  },
  async revoke(courseId: string, entitlementId: string, reason: string): Promise<Entitlement> {
    return check(
      entitlementSchema,
      await authedFetch(
        `/staff/courses/${enc(courseId)}/entitlements/${enc(entitlementId)}/revoke`,
        { method: "POST", body: { reason } },
      ),
    );
  },
};
