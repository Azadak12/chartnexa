import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  LESSON_ERROR_CODES,
  type CompletionResponse,
  type ProgressResponse,
} from "@chartnexa/api-contracts";
import { loadCourseCounts, loadNextLessonId } from "../../database/course-progress.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { EntitlementsService } from "../entitlements/index.js";

const NO_ACCESS = "Enroll in this course to track your progress.";

@Injectable()
export class ProgressService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
  ) {}

  /** The check comes first, so someone without access learns nothing about which lessons exist. */
  private async requireOwner(userId: string, courseId: string): Promise<void> {
    if (!(await this.entitlements.hasActive(userId, courseId))) {
      throw new ForbiddenException({
        message: NO_ACCESS,
        code: LESSON_ERROR_CODES.enrollmentRequired,
      });
    }
  }

  /** Marks a lesson complete. Repeating it keeps the first time and still succeeds. */
  async mark(userId: string, courseId: string, lessonId: string): Promise<CompletionResponse> {
    await this.requireOwner(userId, courseId);
    const lesson = await this.db.lesson.findFirst({
      where: { id: lessonId, courseId },
      select: { id: true },
    });
    if (!lesson) throw new NotFoundException("Lesson not found.");
    // The primary key decides when two requests arrive together; the loser changes nothing.
    await this.db.$executeRaw`
      INSERT INTO lesson_completions (user_id, lesson_id, course_id)
      VALUES (${userId}::uuid, ${lessonId}::uuid, ${courseId}::uuid)
      ON CONFLICT (user_id, lesson_id) DO NOTHING`;
    const row = await this.db.lessonCompletion.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
    // The lesson could have been deleted between the check and the insert (the cascade removed it).
    if (!row) throw new NotFoundException("Lesson not found.");
    return { completed: true, completedAt: row.completedAt.toISOString() };
  }

  /** Removes the mark. Repeating it, or unmarking a lesson that was never marked, still succeeds. */
  async unmark(userId: string, courseId: string, lessonId: string): Promise<CompletionResponse> {
    await this.requireOwner(userId, courseId);
    const lesson = await this.db.lesson.findFirst({
      where: { id: lessonId, courseId },
      select: { id: true },
    });
    if (!lesson) throw new NotFoundException("Lesson not found.");
    await this.db.lessonCompletion.deleteMany({ where: { userId, lessonId, courseId } });
    return { completed: false };
  }

  async read(userId: string, courseId: string): Promise<ProgressResponse> {
    await this.requireOwner(userId, courseId);
    const [counts, next, rows] = await Promise.all([
      loadCourseCounts(this.db, userId, [courseId]),
      loadNextLessonId(this.db, userId, courseId),
      this.db.lessonCompletion.findMany({
        where: { userId, courseId },
        orderBy: { completedAt: "asc" },
        select: { lessonId: true, completedAt: true },
      }),
    ]);
    const c = counts.get(courseId) ?? { completed: 0, total: 0 };
    return {
      completed: c.completed,
      total: c.total,
      nextLessonId: next,
      lessons: rows.map((r) => ({
        lessonId: r.lessonId,
        completedAt: r.completedAt.toISOString(),
      })),
    };
  }

  /** Runs inside the account-deletion transaction: the person's completions go with the account. */
  async deleteForAccount(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.lessonCompletion.deleteMany({ where: { userId } });
  }
}
