import {
  fileLinkSchema,
  publicResourceListSchema,
  staffResourceListSchema,
  staffResourceSchema,
  uploadSessionSchema,
  type CompleteUploadRequest,
  type FileLink,
  type PublicResource,
  type StaffResource,
  type StartUploadRequest,
  type UploadSession,
} from "@chartnexa/api-contracts";
import { z } from "zod";
import { AppError, messageFor } from "../api/errors";
import { viewerFetch } from "../api/viewer-fetch";
import { authedFetch } from "../auth/authed-fetch";

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}
const enc = encodeURIComponent;
const lessonPath = (c: string, l: string) => `/courses/${enc(c)}/lessons/${enc(l)}`;
const staffPath = (c: string) => `/staff/courses/${enc(c)}`;

/** Files of a lesson the viewer may read, and short-lived links to open them. */
export const resourceApi = {
  async list(courseId: string, lessonId: string): Promise<PublicResource[]> {
    return check(
      publicResourceListSchema,
      await viewerFetch(`${lessonPath(courseId, lessonId)}/resources`),
    ).items;
  },
  async link(courseId: string, lessonId: string, id: string, download: boolean): Promise<FileLink> {
    return check(
      fileLinkSchema,
      await viewerFetch(`${lessonPath(courseId, lessonId)}/resources/${enc(id)}/link`, {
        method: "POST",
        body: { download },
      }),
    );
  },
};

/** Staff side. The server checks the course permission on every call. */
export const staffResourceApi = {
  async list(courseId: string, lessonId: string): Promise<StaffResource[]> {
    return check(
      staffResourceListSchema,
      await authedFetch(`${staffPath(courseId)}/lessons/${enc(lessonId)}/resources`),
    ).items;
  },
  async start(
    courseId: string,
    lessonId: string,
    body: StartUploadRequest,
  ): Promise<UploadSession> {
    return check(
      uploadSessionSchema,
      await authedFetch(`${staffPath(courseId)}/lessons/${enc(lessonId)}/uploads`, {
        method: "POST",
        body,
      }),
    );
  },
  async putPart(courseId: string, uploadId: string, n: number, bytes: Uint8Array): Promise<void> {
    await authedFetch(`${staffPath(courseId)}/uploads/${enc(uploadId)}/parts/${n}`, {
      method: "PUT",
      rawBody: bytes,
      timeoutMs: 120_000,
    });
  },
  async complete(
    courseId: string,
    uploadId: string,
    body: CompleteUploadRequest,
  ): Promise<StaffResource> {
    return check(
      staffResourceSchema,
      await authedFetch(`${staffPath(courseId)}/uploads/${enc(uploadId)}/complete`, {
        method: "POST",
        body,
        timeoutMs: 120_000,
      }),
    );
  },
  async cancel(courseId: string, uploadId: string): Promise<void> {
    await authedFetch(`${staffPath(courseId)}/uploads/${enc(uploadId)}`, { method: "DELETE" });
  },
  async update(
    courseId: string,
    lessonId: string,
    id: string,
    body: { expectedVersion: number; title?: string; downloadable?: boolean },
  ): Promise<StaffResource> {
    return check(
      staffResourceSchema,
      await authedFetch(`${staffPath(courseId)}/lessons/${enc(lessonId)}/resources/${enc(id)}`, {
        method: "PATCH",
        body,
      }),
    );
  },
  async remove(courseId: string, lessonId: string, id: string): Promise<void> {
    await authedFetch(`${staffPath(courseId)}/lessons/${enc(lessonId)}/resources/${enc(id)}`, {
      method: "DELETE",
    });
  },
};
