import { z } from "zod";

export const LEADERBOARD_PERIODS = ["weekly", "monthly", "all"] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];
export const LEADERBOARD_LIMIT = 50;

export const leaderboardQuerySchema = z.strictObject({
  period: z.enum(LEADERBOARD_PERIODS).default("weekly"),
  courseId: z.uuid().optional(),
});
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

export const leaderboardSettingsSchema = z.object({ optedIn: z.boolean() });
export type LeaderboardSettings = z.infer<typeof leaderboardSettingsSchema>;
export const updateLeaderboardSettingsRequestSchema = z.strictObject({ optedIn: z.boolean() });

/**
 * Ranked by verified lesson completions in the period; learners with the same count share a rank.
 * No ids, emails or scores other than the count are ever sent.
 */
export const leaderboardEntrySchema = z.object({
  rank: z.number().int(),
  displayName: z.string(),
  completedLessons: z.number().int(),
  isMe: z.boolean(),
});
export const leaderboardSchema = z.object({
  period: z.enum(LEADERBOARD_PERIODS),
  /** Start of the period (UTC) or null for all time. */
  since: z.string().nullable(),
  courseId: z.string().nullable(),
  entries: z.array(leaderboardEntrySchema),
  /** The signed-in learner's own standing, even when outside the listed entries. */
  me: z.object({
    optedIn: z.boolean(),
    rank: z.number().int().nullable(),
    completedLessons: z.number().int().nullable(),
  }),
});
export type Leaderboard = z.infer<typeof leaderboardSchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
