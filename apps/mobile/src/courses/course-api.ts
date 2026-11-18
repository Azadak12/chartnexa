import {
  publicCourseDetailSchema,
  publicCourseSummarySchema,
  staffCourseSchema,
  type CatalogQuery,
  type CreateCourseRequest,
  type Page,
  type PublicCourseDetail,
  type PublicCourseSummary,
  type StaffCourse,
  type UpdateCourseRequest,
  accessResponseSchema,
  type AccessResponse,
} from "@chartnexa/api-contracts";
import { z } from "zod";
import { apiFetch } from "../api/client";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "../auth/authed-fetch";
import { viewerFetch } from "../api/viewer-fetch";

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}

const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

function query(params: Record<string, string | number | undefined>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
}

/** The catalog is public: no sign-in is needed to ask for it. */
export const courseApi = {
  async list(q: CatalogQuery = {}): Promise<Page<PublicCourseSummary>> {
    return check(pageOf(publicCourseSummarySchema), await apiFetch(`/courses${query({ ...q })}`));
  },
  async get(id: string): Promise<PublicCourseDetail> {
    return check(publicCourseDetailSchema, await viewerFetch(`/courses/${encodeURIComponent(id)}`));
  },
};

/** Staff calls need a signed-in person with the right permissions; the server decides. */
export const staffCourseApi = {
  async list(
    q: { status?: "draft" | "published"; cursor?: string } = {},
  ): Promise<Page<StaffCourse>> {
    return check(
      pageOf(staffCourseSchema),
      await authedFetch(`/staff/courses${query({ ...q, limit: 25 })}`),
    );
  },
  async get(id: string): Promise<StaffCourse> {
    return check(staffCourseSchema, await authedFetch(`/staff/courses/${encodeURIComponent(id)}`));
  },
  async create(body: CreateCourseRequest): Promise<StaffCourse> {
    return check(staffCourseSchema, await authedFetch("/staff/courses", { method: "POST", body }));
  },
  async update(id: string, body: UpdateCourseRequest): Promise<StaffCourse> {
    return check(
      staffCourseSchema,
      await authedFetch(`/staff/courses/${encodeURIComponent(id)}`, { method: "PATCH", body }),
    );
  },
  async publish(id: string): Promise<StaffCourse> {
    return check(
      staffCourseSchema,
      await authedFetch(`/staff/courses/${encodeURIComponent(id)}/publish`, { method: "POST" }),
    );
  },
  async unpublish(id: string): Promise<StaffCourse> {
    return check(
      staffCourseSchema,
      await authedFetch(`/staff/courses/${encodeURIComponent(id)}/unpublish`, { method: "POST" }),
    );
  },
};

/** What the caller may do. Informational: the server checks every request again. */
export async function fetchAccess(): Promise<AccessResponse> {
  return check(accessResponseSchema, await authedFetch("/me/access"));
}

const grantsOf = (a: AccessResponse | undefined) => a?.courseGrants ?? [];
const has = (a: AccessResponse | undefined, p: string) => !!a && a.permissions.includes(p);

/** Role permission, or (for Instructors) at least one edit grant or the create grant. */
export const canManageCourses = (a: AccessResponse | undefined): boolean =>
  has(a, "course:create") ||
  has(a, "course:update") ||
  grantsOf(a).some((g) => g.permissions.includes("course:update"));

export const canCreateCourses = (a: AccessResponse | undefined): boolean => has(a, "course:create");

/** Publishing needs the role permission or a publish grant on that course. */
export const canPublishCourse = (a: AccessResponse | undefined, courseId: string): boolean =>
  has(a, "course:publish") ||
  grantsOf(a).some((g) => g.courseId === courseId && g.permissions.includes("course:publish"));

/** People who may manage Instructor permissions (Admins and Managers). */
export const canManageInstructors = (a: AccessResponse | undefined): boolean =>
  has(a, "instructor_permissions:manage");

/** Admins and Managers hold this by default; the server checks it on every request. */
export const canModerateReviews = (a: AccessResponse | undefined): boolean =>
  has(a, "reviews:moderate");

/** Admins and Managers hold this by default. */
export const canManageCategories = (a: AccessResponse | undefined): boolean =>
  has(a, "categories:manage");

export const isAdmin = (a: AccessResponse | undefined): boolean => !!a && a.roles.includes("admin");

/** Lesson authoring: the role permission, or a lesson grant on that course. */
export const canAuthorLessons = (a: AccessResponse | undefined, courseId: string): boolean =>
  has(a, "lesson:upload") ||
  grantsOf(a).some((g) => g.courseId === courseId && g.permissions.includes("lesson:upload"));

/** Granting and ending access to courses (Admins and Managers). */
export const canManageEnrollments = (a: AccessResponse | undefined): boolean =>
  has(a, "enrollments:manage");
