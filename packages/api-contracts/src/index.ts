import type { Role } from "@chartnexa/shared-types";
import { z } from "zod";

export const fieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
});

export const errorEnvelopeSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  fields: z.array(fieldErrorSchema).optional(),
});

export type FieldError = z.infer<typeof fieldErrorSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE, type Page } from "./pagination.js";

export const isRole = (value: string): value is Role =>
  ["student", "instructor", "manager", "admin"].includes(value);
export * from "./auth.js";
export * from "./access.js";
export * from "./courses.js";
export * from "./grants.js";
export * from "./lessons.js";
export * from "./entitlements.js";
export * from "./progress.js";
export * from "./mfa.js";
export * from "./reviews.js";
export * from "./categories.js";
export * from "./resources.js";
export * from "./video.js";
export * from "./payments.js";
export * from "./live.js";
export * from "./announcements.js";
export * from "./invitations.js";
