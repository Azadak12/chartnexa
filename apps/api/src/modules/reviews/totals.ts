import type { Prisma } from "../../generated/prisma/client.js";

/**
 * Changes a course's stored rating totals by the given amounts. Callers hold the course row lock
 * and call it only for reviews that count (visible ones), so the totals always equal the count
 * and sum of the visible reviews.
 */
export async function adjustTotals(
  tx: Prisma.TransactionClient,
  courseId: string,
  count: number,
  sum: number,
): Promise<void> {
  await tx.$executeRaw`UPDATE courses SET rating_count = rating_count + ${count}, rating_sum = rating_sum + ${sum}
    WHERE id = ${courseId}::uuid`;
}
