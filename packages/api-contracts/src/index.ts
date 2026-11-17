import type { Role } from "@chartnexa/shared-types";

export interface ErrorEnvelope {
  code: string;
  message: string;
  requestId: string;
  fields?: { field: string; message: string }[];
}

export const isRole = (value: string): value is Role =>
  ["student", "instructor", "manager", "admin"].includes(value);
