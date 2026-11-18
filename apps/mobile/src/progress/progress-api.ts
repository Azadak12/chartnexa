import {
  completionResponseSchema,
  progressResponseSchema,
  type CompletionResponse,
  type ProgressResponse,
} from "@chartnexa/api-contracts";
import { z } from "zod";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "../auth/authed-fetch";

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}

const enc = encodeURIComponent;
const path = (courseId: string, lessonId: string) =>
  `/me/courses/${enc(courseId)}/lessons/${enc(lessonId)}/completion`;

/** The signed-in person's own progress; the server decides who owns what on every call. */
export const progressApi = {
  async read(courseId: string): Promise<ProgressResponse> {
    return check(
      progressResponseSchema,
      await authedFetch(`/me/courses/${enc(courseId)}/progress`),
    );
  },
  async mark(courseId: string, lessonId: string): Promise<CompletionResponse> {
    return check(
      completionResponseSchema,
      await authedFetch(path(courseId, lessonId), { method: "PUT" }),
    );
  },
  async unmark(courseId: string, lessonId: string): Promise<CompletionResponse> {
    return check(
      completionResponseSchema,
      await authedFetch(path(courseId, lessonId), { method: "DELETE" }),
    );
  },
};
