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
