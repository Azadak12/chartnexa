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

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

export const isRole = (value: string): value is Role =>
  ["student", "instructor", "manager", "admin"].includes(value);
export * from "./auth.js";
export * from "./access.js";
