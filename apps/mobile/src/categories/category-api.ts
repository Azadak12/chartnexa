import {
  categoryListSchema,
  staffCategoryListSchema,
  staffCategorySchema,
  type Category,
  type StaffCategory,
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
const enc = encodeURIComponent;

/** Public: the catalog's category filter and the names shown on course pages. */
export const categoryApi = {
  async list(): Promise<Category[]> {
    return check(categoryListSchema, await apiFetch("/categories")).items;
  },
};

/** Admins and Managers (`categories:manage`); the server checks every call. */
export const staffCategoryApi = {
  async list(): Promise<StaffCategory[]> {
    return check(staffCategoryListSchema, await authedFetch("/staff/categories")).items;
  },
  async create(name: string): Promise<StaffCategory> {
    return check(
      staffCategorySchema,
      await authedFetch("/staff/categories", { method: "POST", body: { name } }),
    );
  },
  async rename(id: string, expectedVersion: number, name: string): Promise<StaffCategory> {
    return check(
      staffCategorySchema,
      await authedFetch(`/staff/categories/${enc(id)}`, {
        method: "PATCH",
        body: { expectedVersion, name },
      }),
    );
  },
  async remove(id: string): Promise<{ deleted: boolean }> {
    return check(
      z.object({ deleted: z.boolean() }),
      await authedFetch(`/staff/categories/${enc(id)}`, { method: "DELETE" }),
    );
  },
};
