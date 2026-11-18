import {
  deleteReviewResponseSchema,
  myReviewResponseSchema,
  reviewSchema,
  type MyReviewResponse,
  type Page,
  type Review,
} from "@chartnexa/api-contracts";
import { z } from "zod";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "../auth/authed-fetch";
import { viewerFetch } from "../api/viewer-fetch";

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}

const enc = encodeURIComponent;
const pageSchema = z.object({ items: z.array(reviewSchema), nextCursor: z.string().nullable() });

/** Reading is public (a signed-in caller also learns which review is theirs); writing is the person's own. */
export const reviewsApi = {
  async list(courseId: string, cursor?: string): Promise<Page<Review>> {
    const q = cursor ? `?cursor=${enc(cursor)}` : "";
    return check(pageSchema, await viewerFetch(`/courses/${enc(courseId)}/reviews${q}`));
  },
  async mine(courseId: string): Promise<MyReviewResponse> {
    return check(myReviewResponseSchema, await authedFetch(`/me/courses/${enc(courseId)}/review`));
  },
  async write(courseId: string, body: { rating: number; body: string }): Promise<Review> {
    return check(
      reviewSchema,
      await authedFetch(`/me/courses/${enc(courseId)}/review`, { method: "PUT", body }),
    );
  },
  async remove(courseId: string): Promise<{ deleted: boolean }> {
    return check(
      deleteReviewResponseSchema,
      await authedFetch(`/me/courses/${enc(courseId)}/review`, { method: "DELETE" }),
    );
  },
};
