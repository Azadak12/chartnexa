import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DEFAULT_PAGE_SIZE,
  LESSON_ERROR_CODES,
  type AppealReviewRequest,
  type DecideAppealRequest,
  type HideReviewRequest,
  type MyReviewResponse,
  type Page,
  type ReportReviewRequest,
  type ReportReviewResponse,
  type RestoreReviewRequest,
  type StaffReview,
  type StaffReviewActionResponse,
  type StaffReviewDetail,
  type StaffReviewQuery,
} from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { buildPage, decodeCursor } from "../../pagination/cursor.js";
import { AuditService, AuthorizationService } from "../access/index.js";
import { CoursesService } from "../courses/index.js";
import { EntitlementsService } from "../entitlements/index.js";
import { RateLimiterService } from "../rate-limit/index.js";
import { ReviewsService } from "./reviews.service.js";
import { adjustTotals } from "./totals.js";

type Tx = Prisma.TransactionClient;
type Reason = ReportReviewRequest["reason"];

const NOT_FOUND = "Review not found.";
const iso = (d: Date): string => d.toISOString();

const staffInclude = {
  user: { select: { displayName: true } },
  course: { select: { title: true } },
  reports: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 },
  appeals: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
} satisfies Prisma.ReviewInclude;
type StaffRow = Prisma.ReviewGetPayload<{ include: typeof staffInclude }>;

/** Who is acting, and the request id for the audit trail. */
export interface Actor {
  userId: string;
  requestId?: string | undefined;
}

@Injectable()
export class ModerationService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(CoursesService) private readonly courses: CoursesService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(RateLimiterService) private readonly limiter: RateLimiterService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(ReviewsService) private readonly reviews: ReviewsService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private async auditEvent(
    tx: Tx,
    actor: Actor,
    action: string,
    reviewId: string,
    after: Prisma.InputJsonValue,
    reason?: string,
  ): Promise<void> {
    // Ids, codes and the rating only. Never review text, notes or messages.
    await this.audit.record(tx, {
      actorKind: "user",
      actorUserId: actor.userId,
      action,
      targetType: "review",
      targetId: reviewId,
      outcome: "success",
      after,
      reason: reason ?? null,
      requestId: actor.requestId ?? null,
    });
  }

  private async adjust(tx: Tx, courseId: string, count: number, sum: number): Promise<void> {
    await adjustTotals(tx, courseId, count, sum);
  }

  // --- reporting -----------------------------------------------------------------------------

  /**
   * Reports a visible review of a published course. Reporting never changes what anyone sees,
   * and the same person reporting again changes nothing.
   */
  async report(
    actor: Actor,
    courseId: string,
    reviewId: string,
    input: ReportReviewRequest,
  ): Promise<ReportReviewResponse> {
    await this.courses.assertPublished(courseId);
    const review = await this.db.review.findFirst({
      where: { id: reviewId, courseId, hiddenAt: null },
      select: { userId: true },
    });
    if (!review) throw new NotFoundException(NOT_FOUND);
    if (review.userId === actor.userId) {
      throw new ForbiddenException("You cannot report your own review.");
    }
    await this.limiter.consume(
      `review-report:user:${actor.userId}`,
      this.config.RL_REVIEW_REPORT_MAX,
      this.config.RL_REVIEW_REPORT_WINDOW_SECONDS,
    );
    const note = input.note ?? "";
    await this.db.$transaction(async (tx) => {
      // Same lock as every review change, so a report cannot slip in beside a hiding.
      await this.courses.lockForUpdate(tx, courseId);
      const still = await tx.review.findFirst({
        where: { id: reviewId, courseId, hiddenAt: null },
        select: { id: true },
      });
      if (!still) throw new NotFoundException(NOT_FOUND);
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO review_reports (id, review_id, reporter_id, reason, note)
        VALUES (gen_random_uuid(), ${reviewId}::uuid, ${actor.userId}::uuid, ${input.reason}, ${note})
        ON CONFLICT (review_id, reporter_id) WHERE resolved_at IS NULL DO NOTHING
        RETURNING id`;
      if (inserted.length > 0) {
        await this.auditEvent(
          tx,
          actor,
          "review.report",
          reviewId,
          { courseId, reportId: inserted[0]!.id },
          input.reason,
        );
      }
    });
    return { reported: true };
  }

  // --- hide and restore ----------------------------------------------------------------------

  /** Locks the course, then reads the review. Every totals change happens behind this lock. */
  private async lockedReview(tx: Tx, reviewId: string): Promise<StaffRow> {
    const found = await tx.review.findUnique({
      where: { id: reviewId },
      select: { courseId: true },
    });
    if (!found) throw new NotFoundException(NOT_FOUND);
    await this.courses.lockForUpdate(tx, found.courseId);
    const row = await tx.review.findUnique({ where: { id: reviewId }, include: staffInclude });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }

  /**
   * Hides a review: it leaves public lists and the rating totals, its text is untouched, and the
   * open reports about it are resolved. Hiding twice changes nothing.
   */
  async hide(
    actor: Actor,
    reviewId: string,
    input: HideReviewRequest,
  ): Promise<StaffReviewActionResponse> {
    const changed = await this.db.$transaction(async (tx) => {
      const row = await this.lockedReview(tx, reviewId);
      if (row.hiddenAt) return false;
      await tx.review.update({
        where: { id: reviewId },
        data: {
          hiddenAt: new Date(),
          hiddenById: actor.userId,
          hiddenReason: input.reason,
          hiddenNote: input.note ?? "",
        },
      });
      await this.adjust(tx, row.courseId, -1, -row.rating);
      await tx.reviewReport.updateMany({
        where: { reviewId, resolvedAt: null },
        data: { resolvedAt: new Date() },
      });
      await this.auditEvent(
        tx,
        actor,
        "review.hide",
        reviewId,
        { courseId: row.courseId, rating: row.rating },
        input.reason,
      );
      return true;
    });
    return { review: await this.detail(reviewId, actor.userId), changed };
  }

  /**
   * Puts a hidden review back. An open appeal is settled as overturned in the same step. Restoring
   * a visible review changes nothing.
   */
  async restore(
    actor: Actor,
    reviewId: string,
    input: RestoreReviewRequest,
  ): Promise<StaffReviewActionResponse> {
    const changed = await this.db.$transaction(async (tx) => {
      const row = await this.lockedReview(tx, reviewId);
      if (!row.hiddenAt) return false;
      await this.unhide(tx, row);
      await tx.reviewAppeal.updateMany({
        where: { reviewId, status: "open" },
        data: {
          status: "overturned",
          decidedById: actor.userId,
          decidedNote: input.note || null,
          decidedAt: new Date(),
        },
      });
      await this.auditEvent(tx, actor, "review.restore", reviewId, {
        courseId: row.courseId,
        rating: row.rating,
      });
      return true;
    });
    return { review: await this.detail(reviewId, actor.userId), changed };
  }

  private async unhide(tx: Tx, row: StaffRow): Promise<void> {
    await tx.review.update({
      where: { id: row.id },
      data: { hiddenAt: null, hiddenById: null, hiddenReason: null, hiddenNote: null },
    });
    await this.adjust(tx, row.courseId, 1, row.rating);
  }

  // --- appeals -------------------------------------------------------------------------------

  /** The author appeals their review's current hiding, once. */
  async appeal(
    actor: Actor,
    courseId: string,
    input: AppealReviewRequest,
  ): Promise<MyReviewResponse> {
    if (!(await this.entitlements.hasActive(actor.userId, courseId))) {
      throw new ForbiddenException({
        message: "Enroll in this course to review it.",
        code: LESSON_ERROR_CODES.enrollmentRequired,
      });
    }
    await this.db.$transaction(async (tx) => {
      await this.courses.lockForUpdate(tx, courseId);
      const row = await tx.review.findUnique({
        where: { userId_courseId: { userId: actor.userId, courseId } },
      });
      if (!row || !row.hiddenAt) throw new NotFoundException(NOT_FOUND);
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO review_appeals (id, review_id, hidden_at, message)
        VALUES (gen_random_uuid(), ${row.id}::uuid, ${row.hiddenAt}::timestamptz, ${input.message})
        ON CONFLICT (review_id, hidden_at) DO NOTHING
        RETURNING id`;
      if (inserted.length === 0) throw new ConflictException("You have already appealed this.");
      await this.auditEvent(tx, actor, "review.appeal", row.id, {
        courseId,
        appealId: inserted[0]!.id,
      });
    });
    return this.reviews.getMine(actor.userId, courseId);
  }

  /**
   * Upholds or overturns an open appeal. The moderator who hid the review cannot decide it unless
   * they can manage roles (an Admin). Overturning restores the review.
   */
  async decide(
    actor: Actor,
    appealId: string,
    input: DecideAppealRequest,
  ): Promise<StaffReviewActionResponse> {
    const reviewId = await this.db.$transaction(async (tx) => {
      const found = await tx.reviewAppeal.findUnique({
        where: { id: appealId },
        select: { reviewId: true },
      });
      if (!found) throw new NotFoundException("Appeal not found.");
      const row = await this.lockedReview(tx, found.reviewId);
      const appeal = await tx.reviewAppeal.findUnique({ where: { id: appealId } });
      if (!appeal) throw new NotFoundException("Appeal not found.");
      if (appeal.status !== "open") throw new ConflictException("This appeal is already decided.");
      if (
        row.hiddenById === actor.userId &&
        !(await this.authz.can(actor.userId, "roles:manage"))
      ) {
        throw new ForbiddenException("Another moderator must decide this appeal.");
      }
      const overturn = input.decision === "overturn";
      await tx.reviewAppeal.update({
        where: { id: appealId },
        data: {
          status: overturn ? "overturned" : "upheld",
          decidedById: actor.userId,
          decidedNote: input.note || null,
          decidedAt: new Date(),
        },
      });
      if (overturn && row.hiddenAt) await this.unhide(tx, row);
      await this.auditEvent(
        tx,
        actor,
        "review.appeal.decide",
        row.id,
        { courseId: row.courseId, appealId, rating: row.rating },
        input.decision,
      );
      return row.id;
    });
    return { review: await this.detail(reviewId, actor.userId), changed: true };
  }

  // --- staff reading -------------------------------------------------------------------------

  private toStaff(r: StaffRow, openReports: number): StaffReview {
    const openAppeal = r.appeals.find((a) => a.status === "open");
    const latestReport = r.reports.find((x) => !x.resolvedAt);
    const activity = openAppeal?.createdAt ?? r.hiddenAt ?? latestReport?.createdAt ?? r.updatedAt;
    return {
      id: r.id,
      courseId: r.courseId,
      courseTitle: r.course.title,
      rating: r.rating,
      body: r.body,
      reviewerName: r.user.displayName?.trim() || "Student",
      createdAt: iso(r.createdAt),
      hidden: r.hiddenAt !== null,
      hiddenAt: r.hiddenAt ? iso(r.hiddenAt) : null,
      hiddenReason: (r.hiddenReason as Reason | null) ?? null,
      openReportCount: openReports,
      openAppeal: openAppeal !== undefined,
      activityAt: iso(activity),
    };
  }

  async detail(reviewId: string, viewerId: string): Promise<StaffReviewDetail> {
    const r = await this.db.review.findUnique({ where: { id: reviewId }, include: staffInclude });
    if (!r) throw new NotFoundException(NOT_FOUND);
    const open = await this.db.reviewReport.count({ where: { reviewId, resolvedAt: null } });
    return {
      ...this.toStaff(r, open),
      hiddenNote: r.hiddenNote,
      hiddenByMe: r.hiddenById === viewerId,
      reports: r.reports.map((x) => ({
        id: x.id,
        reason: x.reason as Reason,
        note: x.note,
        createdAt: iso(x.createdAt),
        resolved: x.resolvedAt !== null,
      })),
      appeals: r.appeals.map((a) => ({
        id: a.id,
        status: a.status as "open" | "upheld" | "overturned",
        message: a.message,
        decidedNote: a.decidedNote,
        createdAt: iso(a.createdAt),
        decidedAt: a.decidedAt ? iso(a.decidedAt) : null,
        hiddenAt: iso(a.hiddenAt),
      })),
    };
  }

  /** Newest activity first. The sort time travels as text so microseconds are never lost. */
  async queue(q: StaffReviewQuery): Promise<Page<StaffReview>> {
    const limit = q.limit ?? DEFAULT_PAGE_SIZE;
    const params: unknown[] = [];
    const courseFilter = q.courseId
      ? (params.push(q.courseId), `AND r.course_id = $${params.length}::uuid`)
      : "";
    const source: Record<StaffReviewQuery["tab"], string> = {
      reported: `SELECT r.id, MAX(rr.created_at) AS sort_ts FROM reviews r
        JOIN review_reports rr ON rr.review_id = r.id AND rr.resolved_at IS NULL
        WHERE r.hidden_at IS NULL ${courseFilter} GROUP BY r.id`,
      hidden: `SELECT r.id, r.hidden_at AS sort_ts FROM reviews r
        WHERE r.hidden_at IS NOT NULL ${courseFilter}`,
      appeals: `SELECT r.id, a.created_at AS sort_ts FROM review_appeals a
        JOIN reviews r ON r.id = a.review_id
        WHERE a.status = 'open' ${courseFilter}`,
    };
    let cursorSql = "";
    if (q.cursor) {
      const [ts, id] = decodeCursor(q.cursor, this.config.CURSOR_SECRET);
      params.push(String(ts), String(id));
      cursorSql = `WHERE (t.sort_ts, t.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    }
    params.push(limit + 1);
    const keys = await this.db.$queryRawUnsafe<{ id: string; sort_text: string }[]>(
      `SELECT t.id, t.sort_ts::text AS sort_text FROM (${source[q.tab]}) t ${cursorSql}
       ORDER BY t.sort_ts DESC, t.id DESC LIMIT $${params.length}`,
      ...params,
    );
    const rows = await this.db.review.findMany({
      where: { id: { in: keys.map((k) => k.id) } },
      include: staffInclude,
    });
    const counts = await this.db.reviewReport.groupBy({
      by: ["reviewId"],
      where: { reviewId: { in: keys.map((k) => k.id) }, resolvedAt: null },
      _count: { _all: true },
    });
    const open = new Map(counts.map((c) => [c.reviewId, c._count._all]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = keys.flatMap((k) => {
      const r = byId.get(k.id);
      return r ? [{ key: k, review: this.toStaff(r, open.get(r.id) ?? 0) }] : [];
    });
    const page = buildPage(
      ordered,
      limit,
      (x) => [x.key.sort_text, x.key.id],
      this.config.CURSOR_SECRET,
    );
    return { items: page.items.map((x) => x.review), nextCursor: page.nextCursor };
  }
}
