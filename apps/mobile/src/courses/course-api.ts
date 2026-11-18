import {
  publicCourseSchema,
  publicCourseSummarySchema,
  staffCourseSchema,
  type CatalogQuery,
  type CreateCourseRequest,
  type Page,
  type PublicCourse,
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
  async get(id: string): Promise<PublicCourse> {
    return check(publicCourseSchema, await apiFetch(`/courses/${encodeURIComponent(id)}`));
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

export const canManageCourses = (a: AccessResponse | undefined): boolean =>
  !!a && (a.permissions.includes("course:create") || a.permissions.includes("course:update"));
