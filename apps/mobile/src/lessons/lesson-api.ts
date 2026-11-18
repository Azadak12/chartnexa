import {
  lessonOutlineSchema,
  publicLessonSchema,
  staffLessonListSchema,
  staffLessonSchema,
  type CreateLessonRequest,
  type LessonOutline,
  type PublicLesson,
  type StaffLesson,
  type StaffLessonList,
  type UpdateLessonRequest,
} from "@chartnexa/api-contracts";
import { z } from "zod";
import { viewerFetch } from "../api/viewer-fetch";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "../auth/authed-fetch";

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}

const enc = encodeURIComponent;

/** Public: the outline of a published course, and the text of free-preview lessons only. */
export const lessonApi = {
  async outline(courseId: string): Promise<LessonOutline> {
    return check(lessonOutlineSchema, await viewerFetch(`/courses/${enc(courseId)}/lessons`));
  },
  async get(courseId: string, lessonId: string): Promise<PublicLesson> {
    return check(
      publicLessonSchema,
      await viewerFetch(`/courses/${enc(courseId)}/lessons/${enc(lessonId)}`),
    );
  },
};

/** Staff calls; the server decides who may author lessons on each course. */
export const staffLessonApi = {
  async list(courseId: string): Promise<StaffLessonList> {
    return check(
      staffLessonListSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/lessons`),
    );
  },
  async get(courseId: string, lessonId: string): Promise<StaffLesson> {
    return check(
      staffLessonSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/lessons/${enc(lessonId)}`),
    );
  },
  async create(courseId: string, body: CreateLessonRequest): Promise<StaffLesson> {
    return check(
      staffLessonSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/lessons`, { method: "POST", body }),
    );
  },
  async update(
    courseId: string,
    lessonId: string,
    body: UpdateLessonRequest,
  ): Promise<StaffLesson> {
    return check(
      staffLessonSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/lessons/${enc(lessonId)}`, {
        method: "PATCH",
        body,
      }),
    );
  },
  async remove(courseId: string, lessonId: string): Promise<void> {
    await authedFetch(`/staff/courses/${enc(courseId)}/lessons/${enc(lessonId)}`, {
      method: "DELETE",
    });
  },
  async addModule(courseId: string, title: string): Promise<StaffLessonList> {
    return check(
      staffLessonListSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/modules`, {
        method: "POST",
        body: { title },
      }),
    );
  },
  async renameModule(
    courseId: string,
    moduleId: string,
    expectedVersion: number,
    title: string,
  ): Promise<StaffLessonList> {
    return check(
      staffLessonListSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/modules/${enc(moduleId)}`, {
        method: "PATCH",
        body: { expectedVersion, title },
      }),
    );
  },
  async removeModule(courseId: string, moduleId: string): Promise<StaffLessonList> {
    return check(
      staffLessonListSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/modules/${enc(moduleId)}`, {
        method: "DELETE",
      }),
    );
  },
  async reorderModules(courseId: string, moduleIds: string[]): Promise<StaffLessonList> {
    return check(
      staffLessonListSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/modules/order`, {
        method: "PUT",
        body: { moduleIds },
      }),
    );
  },
  async moveToModule(
    courseId: string,
    lessonId: string,
    moduleId: string | null,
  ): Promise<StaffLessonList> {
    return check(
      staffLessonListSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/lessons/${enc(lessonId)}/module`, {
        method: "PUT",
        body: { moduleId },
      }),
    );
  },
  async reorder(courseId: string, lessonIds: string[]): Promise<StaffLessonList> {
    return check(
      staffLessonListSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/lessons/order`, {
        method: "PUT",
        body: { lessonIds },
      }),
    );
  },
};
