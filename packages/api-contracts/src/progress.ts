import { z } from "zod";

/** Lessons complete out of lessons that exist now. */
export const courseProgressSchema = z.object({
  completed: z.number().int().min(0),
  total: z.number().int().min(0),
});

export const completionResponseSchema = z.discriminatedUnion("completed", [
  z.object({ completed: z.literal(true), completedAt: z.string() }),
  z.object({ completed: z.literal(false) }),
]);

/** One person's progress in one course they own. */
export const progressResponseSchema = z.object({
  completed: z.number().int().min(0),
  total: z.number().int().min(0),
  /** The first lesson, in order, not yet complete; null when all are complete or there are none. */
  nextLessonId: z.string().nullable(),
  lessons: z.array(z.object({ lessonId: z.string(), completedAt: z.string() })),
});

export type CourseProgress = z.infer<typeof courseProgressSchema>;
export type CompletionResponse = z.infer<typeof completionResponseSchema>;
export type ProgressResponse = z.infer<typeof progressResponseSchema>;

/** The course to pick up again: the owned, unfinished course with the most recent activity. */
export const continueLearningSchema = z.object({
  item: z
    .object({
      courseId: z.string(),
      courseTitle: z.string(),
      coverTone: z.string(),
      thumbnailUrl: z.string().nullable().default(null),
      completed: z.number().int().min(0),
      total: z.number().int().min(0),
      nextLessonId: z.string(),
      nextLessonTitle: z.string(),
      /** The latest completion or video progress, or when access began if nothing yet. */
      lastActivityAt: z.string(),
    })
    .nullable(),
});
export type ContinueLearning = z.infer<typeof continueLearningSchema>;
