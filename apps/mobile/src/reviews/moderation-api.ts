import {
  staffReviewActionResponseSchema,
  staffReviewDetailSchema,
  staffReviewSchema,
  type DecideAppealRequest,
  type HideReviewRequest,
  type Page,
  type RestoreReviewRequest,
  type StaffReview,
  type StaffReviewActionResponse,
  type StaffReviewDetail,
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
const pageSchema = z.object({
  items: z.array(staffReviewSchema),
  nextCursor: z.string().nullable(),
});

export type QueueTab = "reported" | "hidden" | "appeals";

/** Moderators only. The server checks the permission on every call. */
export const moderationApi = {
  async queue(tab: QueueTab, cursor?: string): Promise<Page<StaffReview>> {
    const q = `?tab=${tab}${cursor ? `&cursor=${enc(cursor)}` : ""}`;
    return check(pageSchema, await authedFetch(`/staff/reviews${q}`));
  },
  async detail(id: string): Promise<StaffReviewDetail> {
    return check(staffReviewDetailSchema, await authedFetch(`/staff/reviews/${enc(id)}`));
  },
  async hide(id: string, body: HideReviewRequest): Promise<StaffReviewActionResponse> {
    return check(
      staffReviewActionResponseSchema,
      await authedFetch(`/staff/reviews/${enc(id)}/hide`, { method: "POST", body }),
    );
  },
  async restore(id: string, body: RestoreReviewRequest = {}): Promise<StaffReviewActionResponse> {
    return check(
      staffReviewActionResponseSchema,
      await authedFetch(`/staff/reviews/${enc(id)}/restore`, { method: "POST", body }),
    );
  },
  async decide(appealId: string, body: DecideAppealRequest): Promise<StaffReviewActionResponse> {
    return check(
      staffReviewActionResponseSchema,
      await authedFetch(`/staff/review-appeals/${enc(appealId)}/decide`, { method: "POST", body }),
    );
  },
};
