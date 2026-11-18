import type { PrismaService } from "./prisma.service.js";

export interface CourseCounts {
  completed: number;
  total: number;
}

/**
 * Lessons complete out of lessons that exist, for many courses in ONE query, so a list never
 * costs more as it grows. Courses with no lessons are absent from the result (read as 0 of 0).
 */
export async function loadCourseCounts(
  db: Pick<PrismaService, "$queryRaw">,
  userId: string,
  courseIds: readonly string[],
): Promise<Map<string, CourseCounts>> {
  const out = new Map<string, CourseCounts>();
  if (courseIds.length === 0) return out;
  const rows = await db.$queryRaw<{ course_id: string; total: bigint; completed: bigint }[]>`
    SELECT l.course_id, count(*) AS total, count(c.lesson_id) AS completed
    FROM lessons l
    LEFT JOIN lesson_completions c ON c.lesson_id = l.id AND c.user_id = ${userId}::uuid
    WHERE l.course_id = ANY(${[...courseIds]}::uuid[])
    GROUP BY l.course_id`;
  for (const r of rows) {
    out.set(r.course_id, { completed: Number(r.completed), total: Number(r.total) });
  }
  return out;
}

/** The first lesson, in order, that this person has not completed; null when none is left. */
export async function loadNextLessonId(
  db: Pick<PrismaService, "$queryRaw">,
  userId: string,
  courseId: string,
): Promise<string | null> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT l.id FROM lessons l
    WHERE l.course_id = ${courseId}::uuid
      AND NOT EXISTS (
        SELECT 1 FROM lesson_completions c WHERE c.lesson_id = l.id AND c.user_id = ${userId}::uuid)
    ORDER BY l.position ASC LIMIT 1`;
  return rows[0]?.id ?? null;
}
