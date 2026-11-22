import {
  leaderboardSchema,
  leaderboardSettingsSchema,
  type Leaderboard,
  type LeaderboardPeriod,
  type LeaderboardSettings,
} from "@chartnexa/api-contracts";
import { z } from "zod";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "../auth/authed-fetch";

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}

export const leaderboardApi = {
  async board(period: LeaderboardPeriod, courseId?: string): Promise<Leaderboard> {
    const qs = `?period=${period}${courseId ? `&courseId=${encodeURIComponent(courseId)}` : ""}`;
    return check(leaderboardSchema, await authedFetch(`/leaderboard${qs}`));
  },
  async setOptIn(optedIn: boolean): Promise<LeaderboardSettings> {
    return check(
      leaderboardSettingsSchema,
      await authedFetch("/me/leaderboard-settings", { method: "PUT", body: { optedIn } }),
    );
  },
};
