import {
  staffTipListSchema,
  staffTipSchema,
  tipOfTheDaySchema,
  type CreateTipRequest,
  type StaffTip,
  type TipOfTheDay,
} from "@chartnexa/api-contracts";
import { z } from "zod";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "../auth/authed-fetch";

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}

export const tipApi = {
  async today(): Promise<TipOfTheDay> {
    return check(tipOfTheDaySchema, await authedFetch("/me/tip-of-the-day"));
  },
};

export const staffTipApi = {
  async list(): Promise<StaffTip[]> {
    return check(staffTipListSchema, await authedFetch("/staff/tips")).items;
  },
  async create(body: CreateTipRequest): Promise<StaffTip> {
    return check(staffTipSchema, await authedFetch("/staff/tips", { method: "POST", body }));
  },
  async archive(id: string): Promise<StaffTip> {
    return check(
      staffTipSchema,
      await authedFetch(`/staff/tips/${encodeURIComponent(id)}/archive`, { method: "POST" }),
    );
  },
};
