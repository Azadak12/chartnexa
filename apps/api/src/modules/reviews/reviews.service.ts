import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  DEFAULT_PAGE_SIZE,
  LESSON_ERROR_CODES,
  REVIEW_PAGE_SIZE,
  type ModerationState,
  type MyReviewResponse,
  type Page,
  type Review,
  type WriteReviewRequest,
} from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { buildPage, decodeCursor } from "../../pagination/cursor.js";
import { CoursesService } from "../courses/index.js";
import { EntitlementsService } from "../entitlements/index.js";
import { RateLimiterService } from "../rate-limit/index.js";
import { adjustTotals } from "./totals.js";

type Tx = Prisma.TransactionClient;
type Row = Prisma.ReviewGetPayload<{ include: { user: { select: { displayName: true } } } }>;

const NO_ACCESS = "Enroll in this course to review it.";
const FALLBACK_NAME = "Student";
const iso = (d: Date): string => d.toISOString();

/** Only what anyone may see: never an email address or a user id. */
export function toReview(r: Row, viewerId: string | undefined): Review {
  return {
    id: r.id,
    rating: r.rating,
    body: r.body,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    reviewerName: r.user.displayName?.trim() || FALLBACK_NAME,
    mine: viewerId !== undefined && r.userId === viewerId,
  };
}

/** What the author sees about their own hidden review: the reason, the note, and the appeal. */
export function toModeration(
  r: Prisma.ReviewGetPayload<{ include: { appeals: true } }>,
): ModerationState | null {
  if (!r.hiddenAt || !r.hiddenReason) return null;
  const appeal = r.appeals.find((a) => a.hiddenAt.getTime() === r.hiddenAt!.getTime()) ?? null;
  return {
    state: "hidden",
    reason: r.hiddenReason as ModerationState["reason"],
    note: r.hiddenNote ?? "",
    hiddenAt: iso(r.hiddenAt),
    canAppeal: appeal === null,
    appeal: appeal && {
      status: appeal.status as NonNullable<ModerationState["appeal"]>["status"],
      message: appeal.message,
      decidedNote: appeal.decidedNote,
      createdAt: iso(appeal.createdAt),
      decidedAt: appeal.decidedAt ? iso(appeal.decidedAt) : null,
    },
  };
}

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(CoursesService) private readonly courses: CoursesService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(RateLimiterService) private readonly limiter: RateLimiterService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /** The check comes first, so someone without access learns nothing else. */
  private async requireOwner(userId: string, courseId: string): Promise<void> {
    if (!(await this.entitlements.hasActive(userId, courseId))) {
      throw new ForbiddenException({
        message: NO_ACCESS,
        code: LESSON_ERROR_CODES.enrollmentRequired,
      });
    }
  }

  private async limitWrites(userId: string): Promise<void> {
    await this.limiter.consume(
      `review:user:${userId}`,
      this.config.RL_REVIEW_USER_MAX,
      this.config.RL_REVIEW_WINDOW_SECONDS,
    );
  }

  private async load(
    tx: Tx | PrismaService,
    userId: string,
    courseId: string,
  ): Promise<Row | null> {
    return tx.review.findUnique({
      where: { userId_courseId: { userId, courseId } },
      include: { user: { select: { displayName: true } } },
    });
  }

  /** One place for totals changes, so tests can make it fail in the middle of a write. */
  private async adjust(tx: Tx, courseId: string, count: number, sum: number): Promise<void> {
    await adjustTotals(tx, courseId, count, sum);
  }

  async getMine(userId: string, courseId: string): Promise<MyReviewResponse> {
    await this.requireOwner(userId, courseId);
    const row = await this.db.review.findUnique({
      where: { userId_courseId: { userId, courseId } },
      include: { user: { select: { displayName: true } }, appeals: true },
    });
    return {
      review: row ? toReview(row, userId) : null,
      moderation: row ? toModeration(row) : null,
    };
  }

  /**
   * Creates or replaces the person's review. The course row is locked first, so all review
   * writes for a course happen one at a time and the stored totals change by exactly the
   * difference between the new rating and the old one.
   */
  async write(userId: string, courseId: string, input: WriteReviewRequest): Promise<Review> {
    await this.requireOwner(userId, courseId);
    await this.limitWrites(userId);
    const rating = input.rating;
    const body = input.body ?? "";
    return this.db.$transaction(async (tx) => {
      await this.courses.lockForUpdate(tx, courseId);
      const before = await this.load(tx, userId, courseId);
      if (before && before.rating === rating && before.body === body) {
        return toReview(before, userId);
      }
      if (before) {
        await tx.review.update({ where: { id: before.id }, data: { rating, body } });
        // A hidden review is not in the totals, so editing it must not move them.
        if (!before.hiddenAt) await this.adjust(tx, courseId, 0, rating - before.rating);
      } else {
        await tx.review.create({ data: { userId, courseId, rating, body } });
        await this.adjust(tx, courseId, 1, rating);
      }
      return toReview((await this.load(tx, userId, courseId)) as Row, userId);
    });
  }

  /** Deleting twice, or deleting a review that never existed, still succeeds. */
  async remove(userId: string, courseId: string): Promise<{ deleted: boolean }> {
    await this.requireOwner(userId, courseId);
    await this.limitWrites(userId);
    return this.db.$transaction(async (tx) => {
      await this.courses.lockForUpdate(tx, courseId);
      const before = await tx.review.findUnique({
        where: { userId_courseId: { userId, courseId } },
      });
      if (!before) return { deleted: false };
      await tx.review.delete({ where: { id: before.id } });
      if (!before.hiddenAt) await this.adjust(tx, courseId, -1, -before.rating);
      return { deleted: true };
    });
  }

  // --- public --------------------------------------------------------------------------------

  /** Published courses are open to everyone; an unpublished one only to its owners. */
  private async assertVisible(courseId: string, viewerId?: string): Promise<void> {
    try {
      await this.courses.assertPublished(courseId);
    } catch (e) {
      if (e instanceof NotFoundException && viewerId !== undefined) {
        if (await this.entitlements.hasActive(viewerId, courseId)) return;
      }
      throw e;
    }
  }

  async list(
    courseId: string,
    viewerId: string | undefined,
    q: { limit?: number | undefined; cursor?: string | undefined },
  ): Promise<Page<Review>> {
    await this.assertVisible(courseId, viewerId);
    const limit = q.limit ?? REVIEW_PAGE_SIZE ?? DEFAULT_PAGE_SIZE;
    const where: string[] = [`course_id = $1::uuid`, `hidden_at IS NULL`];
    const params: unknown[] = [courseId];
    if (q.cursor) {
      const [ts, id] = decodeCursor(q.cursor, this.config.CURSOR_SECRET);
      params.push(String(ts), String(id));
      where.push(
        `(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
      );
    }
    params.push(limit + 1);
    const ids = await this.db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM reviews WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      ...params,
    );
    const rows = await this.db.review.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: { user: { select: { displayName: true } } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((r) => byId.get(r.id)).filter((r): r is Row => r !== undefined);
    const page = buildPage(
      ordered,
      limit,
      (r) => [iso(r.createdAt), r.id],
      this.config.CURSOR_SECRET,
    );
    return { items: page.items.map((r) => toReview(r, viewerId)), nextCursor: page.nextCursor };
  }

  // --- account deletion ----------------------------------------------------------------------

  /** Inside the account-deletion transaction: the person's reviews go and the totals follow. */
  async deleteForAccount(tx: Tx, userId: string): Promise<void> {
    await tx.reviewReport.deleteMany({ where: { reporterId: userId } });
    const mine = await tx.review.findMany({
      where: { userId },
      select: { id: true, courseId: true, rating: true, hiddenAt: true },
      orderBy: { courseId: "asc" },
    });
    if (mine.length === 0) return;
    // Courses are locked in one fixed order so two deletions can never wait on each other.
    const courseIds = [...new Set(mine.map((r) => r.courseId))];
    await tx.$queryRaw`SELECT id FROM courses WHERE id = ANY(${courseIds}::uuid[]) ORDER BY id FOR UPDATE`;
    // Hidden reviews are not in the totals, so only visible ones are subtracted.
    for (const r of mine) if (!r.hiddenAt) await this.adjust(tx, r.courseId, -1, -r.rating);
    await tx.review.deleteMany({ where: { userId } });
  }
}
