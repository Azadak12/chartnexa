import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  DEFAULT_PAGE_SIZE,
  type CourseStudent,
  type Entitlement,
  type GrantEntitlementResponse,
  type MyCourse,
  type Page,
} from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { loadCourseCounts } from "../../database/course-progress.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { buildPage, decodeCursor } from "../../pagination/cursor.js";
import { AuditService } from "../access/index.js";

type Row = Prisma.EntitlementGetPayload<object>;

const SUMMARY_LENGTH = 160;
const iso = (d: Date): string => d.toISOString();

export function toEntitlement(r: Row): Entitlement {
  return {
    id: r.id,
    courseId: r.courseId,
    userId: r.userId,
    source: r.source as Entitlement["source"],
    status: r.status as Entitlement["status"],
    grantReason: r.grantReason,
    createdAt: iso(r.createdAt),
    revokedAt: r.revokedAt ? iso(r.revokedAt) : null,
  };
}

interface Actor {
  userId: string;
  requestId: string;
}

@Injectable()
export class EntitlementsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Whether this person may learn this course right now. Always reads the database: no cache and
   * no token claim may grant access (ADR-0006).
   */
  async hasActive(userId: string, courseId: string): Promise<boolean> {
    const row = await this.db.entitlement.findFirst({
      where: { userId, courseId, status: "active" },
      select: { id: true },
    });
    return row !== null;
  }

  // --- staff ---------------------------------------------------------------------------------

  /** Gives access. Repeating it changes nothing and writes no audit record. */
  async grant(
    actor: Actor,
    courseId: string,
    input: { userId: string; reason: string },
  ): Promise<GrantEntitlementResponse> {
    return this.db.$transaction(async (tx) => {
      const course = await tx.course.findUnique({ where: { id: courseId }, select: { id: true } });
      if (!course) throw new NotFoundException("Course not found.");
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { status: true, emailVerifiedAt: true },
      });
      if (!user || user.status === "deleted") throw new NotFoundException("Person not found.");
      if (user.status !== "active" || !user.emailVerifiedAt) {
        throw new ConflictException(
          "This person cannot be given access yet: their account must be active with a verified email.",
        );
      }

      // The partial unique index decides who wins when two requests arrive together. If the row
      // that blocked the insert is revoked before we can read it, the loop simply tries again.
      let inserted: { id: string }[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        inserted = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO entitlements (id, user_id, course_id, source, status, grant_reason, granted_by)
          VALUES (gen_random_uuid(), ${input.userId}::uuid, ${courseId}::uuid, 'admin_grant', 'active',
                  ${input.reason}, ${actor.userId}::uuid)
          ON CONFLICT (user_id, course_id) WHERE status = 'active' DO NOTHING
          RETURNING id`;
        if (inserted.length > 0) break;
        const existing = await tx.entitlement.findFirst({
          where: { userId: input.userId, courseId, status: "active" },
        });
        if (existing) return { created: false, entitlement: toEntitlement(existing) };
      }
      if (inserted.length === 0) {
        throw new ConflictException("Access changed while saving. Please try again.");
      }
      const row = await tx.entitlement.findUniqueOrThrow({ where: { id: inserted[0]!.id } });
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actor.userId,
        action: "entitlement.grant",
        targetType: "entitlement",
        targetId: row.id,
        outcome: "success",
        after: { courseId, userId: input.userId, source: row.source },
        reason: input.reason,
        requestId: actor.requestId,
      });
      return { created: true, entitlement: toEntitlement(row) };
    });
  }

  /** Ends access now. Revoking twice changes nothing and writes no audit record. */
  async revoke(
    actor: Actor,
    courseId: string,
    entitlementId: string,
    reason: string,
  ): Promise<Entitlement> {
    return this.db.$transaction(async (tx) => {
      const result = await tx.entitlement.updateMany({
        where: { id: entitlementId, courseId, status: "active" },
        data: {
          status: "revoked",
          revokedAt: new Date(),
          revokedBy: actor.userId,
          revokeReason: reason,
        },
      });
      const row = await tx.entitlement.findFirst({ where: { id: entitlementId, courseId } });
      if (!row) throw new NotFoundException("Entitlement not found.");
      if (result.count === 1) {
        await this.audit.record(tx, {
          actorKind: "user",
          actorUserId: actor.userId,
          action: "entitlement.revoke",
          targetType: "entitlement",
          targetId: row.id,
          outcome: "success",
          before: { status: "active" },
          after: { status: "revoked", courseId, userId: row.userId },
          reason,
          requestId: actor.requestId,
        });
      }
      return toEntitlement(row);
    });
  }

  async listForCourse(
    courseId: string,
    q: { limit?: number | undefined; cursor?: string | undefined },
  ): Promise<Page<CourseStudent>> {
    const course = await this.db.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException("Course not found.");
    const limit = q.limit ?? DEFAULT_PAGE_SIZE;
    const where: string[] = [`course_id = $1::uuid`, `status = 'active'`];
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
      `SELECT id FROM entitlements WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      ...params,
    );
    const rows = await this.db.entitlement.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((r) => byId.get(r.id)).filter((r) => r !== undefined);
    const page = buildPage(
      ordered,
      limit,
      (r) => [iso(r.createdAt), r.id],
      this.config.CURSOR_SECRET,
    );
    return {
      items: page.items.map((r) => ({
        id: r.id,
        user: { id: r.user.id, displayName: r.user.displayName, email: r.user.email },
        source: r.source as CourseStudent["source"],
        grantReason: r.grantReason,
        createdAt: iso(r.createdAt),
      })),
      nextCursor: page.nextCursor,
    };
  }

  // --- the signed-in person ------------------------------------------------------------------

  async listMine(
    userId: string,
    q: { limit?: number | undefined; cursor?: string | undefined },
  ): Promise<Page<MyCourse>> {
    const limit = q.limit ?? DEFAULT_PAGE_SIZE;
    const where: string[] = [`user_id = $1::uuid`, `status = 'active'`];
    const params: unknown[] = [userId];
    if (q.cursor) {
      const [ts, id] = decodeCursor(q.cursor, this.config.CURSOR_SECRET);
      params.push(String(ts), String(id));
      where.push(
        `(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
      );
    }
    params.push(limit + 1);
    const ids = await this.db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM entitlements WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      ...params,
    );
    const rows = await this.db.entitlement.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include: { course: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((r) => byId.get(r.id)).filter((r) => r !== undefined);
    const page = buildPage(
      ordered,
      limit,
      (r) => [iso(r.createdAt), r.id],
      this.config.CURSOR_SECRET,
    );
    // One query for the whole page, so the cost does not grow with the number of courses.
    const counts = await loadCourseCounts(
      this.db,
      userId,
      page.items.map((r) => r.course.id),
    );
    return {
      items: page.items.map((r) => ({
        id: r.course.id,
        title: r.course.title,
        summary:
          r.course.description.length > SUMMARY_LENGTH
            ? `${r.course.description.slice(0, SUMMARY_LENGTH).trimEnd()}…`
            : r.course.description,
        level: r.course.level,
        priceCents: r.course.priceCents,
        currency: "USD" as const,
        coverTone: r.course.coverTone,
        thumbnailUrl:
          r.course.thumbnailId && r.course.thumbnailMime
            ? `/courses/thumbnails/${r.course.thumbnailId}`
            : null,
        onSale: r.course.status === "published",
        enrolledAt: iso(r.createdAt),
        progress: counts.get(r.course.id) ?? { completed: 0, total: 0 },
      })),
      nextCursor: page.nextCursor,
    };
  }
}
