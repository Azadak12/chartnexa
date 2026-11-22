import { z } from "zod";

export const TIP_CATEGORIES = [
  "market_basics",
  "risk_management",
  "technical_analysis",
  "trading_psychology",
] as const;
export type TipCategory = (typeof TIP_CATEGORIES)[number];
export const tipCategorySchema = z.enum(TIP_CATEGORIES);

export const TIP_CATEGORY_LABEL: Record<TipCategory, string> = {
  market_basics: "Market basics",
  risk_management: "Risk management",
  technical_analysis: "Technical analysis",
  trading_psychology: "Trading psychology",
};

export const TIP_BODY_MIN = 10;
export const TIP_BODY_MAX = 240;

/** Plain text only. A course id adds a "Learn more" link to that published course. */
export const createTipRequestSchema = z.strictObject({
  category: tipCategorySchema,
  body: z
    .string()
    .trim()
    .min(TIP_BODY_MIN, `Use ${TIP_BODY_MIN} to ${TIP_BODY_MAX} characters`)
    .max(TIP_BODY_MAX, `Use ${TIP_BODY_MIN} to ${TIP_BODY_MAX} characters`),
  courseId: z.uuid().optional(),
});
export type CreateTipRequest = z.infer<typeof createTipRequestSchema>;

/** What a learner sees: today's tip, or null when staff have not written any yet. */
export const tipOfTheDaySchema = z.object({
  /** The UTC calendar day the tip is for, YYYY-MM-DD. */
  date: z.string(),
  tip: z
    .object({
      id: z.string(),
      category: tipCategorySchema,
      body: z.string(),
      courseId: z.string().nullable(),
      courseTitle: z.string().nullable(),
    })
    .nullable(),
});
export type TipOfTheDay = z.infer<typeof tipOfTheDaySchema>;

export const staffTipSchema = z.object({
  id: z.string(),
  category: tipCategorySchema,
  body: z.string(),
  courseId: z.string().nullable(),
  courseTitle: z.string().nullable(),
  status: z.enum(["active", "archived"]),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type StaffTip = z.infer<typeof staffTipSchema>;
export const staffTipListSchema = z.object({ items: z.array(staffTipSchema) });
