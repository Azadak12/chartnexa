import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  LESSON_ERROR_CODES,
  VIDEO_ERROR_CODES,
  type CompletionResponse,
  type ContinueLearning,
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
    // Q07 (proposal): a lesson with a video completes by watching it, not by a manual mark.
    const video = await this.db.lessonVideo.findFirst({
      where: { lessonId, status: "ready" },
      select: { id: true },
    });
    if (video) {
      throw new ConflictException({
        message: "Watch the video to complete this lesson.",
        code: VIDEO_ERROR_CODES.videoLesson,
      });
    }
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

  /**
   * The owned course with the most recent activity (a completion or video progress; when access
   * began if nothing yet) that still has a lesson left. Finished and empty courses are skipped.
   */
  async continueLearning(userId: string): Promise<ContinueLearning> {
    const rows = await this.db.$queryRaw<{ course_id: string; last: Date }[]>`
      WITH activity AS (
        SELECT course_id, max(completed_at) AS t FROM lesson_completions
        WHERE user_id = ${userId}::uuid GROUP BY course_id
        UNION ALL
        SELECT course_id, max(updated_at) AS t FROM video_progress
        WHERE user_id = ${userId}::uuid GROUP BY course_id
      )
      SELECT e.course_id, greatest(max(e.created_at), coalesce(max(a.t), max(e.created_at))) AS last
      FROM entitlements e
      LEFT JOIN activity a ON a.course_id = e.course_id
      WHERE e.user_id = ${userId}::uuid AND e.status = 'active'
      GROUP BY e.course_id
      ORDER BY last DESC, e.course_id ASC
      LIMIT 20`;
    const counts = await loadCourseCounts(
      this.db,
      userId,
      rows.map((r) => r.course_id),
    );
    for (const r of rows) {
      const c = counts.get(r.course_id);
      if (!c || c.completed >= c.total) continue;
      const nextId = await loadNextLessonId(this.db, userId, r.course_id);
      if (!nextId) continue;
      const [course, lesson] = await Promise.all([
        this.db.course.findUnique({
          where: { id: r.course_id },
          select: { title: true, coverTone: true, thumbnailId: true, thumbnailMime: true },
        }),
        this.db.lesson.findUnique({ where: { id: nextId }, select: { title: true } }),
      ]);
      if (!course || !lesson) continue;
      return {
        item: {
          courseId: r.course_id,
          courseTitle: course.title,
          coverTone: course.coverTone,
          thumbnailUrl:
            course.thumbnailId && course.thumbnailMime
              ? `/courses/thumbnails/${course.thumbnailId}`
              : null,
          completed: c.completed,
          total: c.total,
          nextLessonId: nextId,
          nextLessonTitle: lesson.title,
          lastActivityAt: r.last.toISOString(),
        },
      };
    }
    return { item: null };
  }

  /** Runs inside the account-deletion transaction: the person's completions go with the account. */
  async deleteForAccount(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.lessonCompletion.deleteMany({ where: { userId } });
  }
}
