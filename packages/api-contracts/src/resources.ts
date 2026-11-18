import { z } from "zod";

export const MAX_RESOURCE_BYTES = 50 * 1024 * 1024;
export const UPLOAD_PART_BYTES = 5 * 1024 * 1024;
export const MAX_RESOURCES_PER_LESSON = 20;
export const RESOURCE_TITLE_MAX = 120;

/** Types staff may attach. The server checks the bytes, not only this declaration. */
export const RESOURCE_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;
export const resourceMimeSchema = z.enum(RESOURCE_MIME_TYPES, {
  error: "This file type is not supported. Use PDF, PNG, JPEG, WebP, Word (.docx) or plain text.",
});

export const startUploadRequestSchema = z.strictObject({
  fileName: z.string().trim().min(1, "Choose a file").max(200),
  mimeType: resourceMimeSchema,
  size: z
    .number()
    .int()
    .min(1, "The file is empty")
    .max(MAX_RESOURCE_BYTES, "Files can be up to 50 MB"),
});
export const uploadSessionSchema = z.object({
  uploadId: z.string(),
  partSize: z.number().int(),
  partCount: z.number().int(),
  expiresAt: z.string(),
});
export const completeUploadRequestSchema = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1, "Enter a title")
    .max(RESOURCE_TITLE_MAX, `Use ${RESOURCE_TITLE_MAX} characters or fewer`),
  /**
   * New files default to off: students can view but not save them (decision Q04 pending). On a
   * replace, leaving it out keeps the current setting.
   */
  downloadable: z.boolean().optional(),
  /** Replace this resource's file instead of adding a new resource. */
  replaceResourceId: z.uuid().optional(),
});
export const updateResourceRequestSchema = z
  .strictObject({
    expectedVersion: z.number().int().min(1),
    title: z.string().trim().min(1).max(RESOURCE_TITLE_MAX).optional(),
    downloadable: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.downloadable !== undefined, {
    message: "Provide a title or the download setting",
    path: ["title"],
  });

export const SCAN_STATUSES = ["clean", "not_scanned"] as const;
export const staffResourceSchema = z.object({
  id: z.string(),
  lessonId: z.string(),
  title: z.string(),
  fileName: z.string(),
  mimeType: resourceMimeSchema,
  sizeBytes: z.number().int(),
  downloadable: z.boolean(),
  scanStatus: z.enum(SCAN_STATUSES),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const staffResourceListSchema = z.object({ items: z.array(staffResourceSchema) });

/** What a student sees. No storage key, no scan details. */
export const publicResourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  fileName: z.string(),
  mimeType: resourceMimeSchema,
  sizeBytes: z.number().int(),
  downloadable: z.boolean(),
});
export const publicResourceListSchema = z.object({ items: z.array(publicResourceSchema) });

export const fileLinkRequestSchema = z.strictObject({ download: z.boolean().default(false) });
/** A short-lived link; ask for a new one when it expires. */
export const fileLinkSchema = z.object({
  url: z.string(),
  expiresAt: z.string(),
  download: z.boolean(),
});

export type StartUploadRequest = z.input<typeof startUploadRequestSchema>;
export type UploadSession = z.infer<typeof uploadSessionSchema>;
export type CompleteUploadRequest = z.input<typeof completeUploadRequestSchema>;
export type UpdateResourceRequest = z.input<typeof updateResourceRequestSchema>;
export type StaffResource = z.infer<typeof staffResourceSchema>;
export type PublicResource = z.infer<typeof publicResourceSchema>;
export type FileLink = z.infer<typeof fileLinkSchema>;
export type ResourceMimeType = z.infer<typeof resourceMimeSchema>;
