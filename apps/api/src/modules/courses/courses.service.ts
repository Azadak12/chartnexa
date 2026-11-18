import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateCourseRequest,
  Page,
  PublicCourse,
  PublicCourseDetail,
  PublicCourseSummary,
  CourseRating,
  StaffCourse,
  UpdateCourseRequest,
} from "@chartnexa/api-contracts";
import { createCourseRequestSchema, DEFAULT_PAGE_SIZE } from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { loadCourseCounts, loadNextLessonId } from "../../database/course-progress.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { buildPage, decodeCursor } from "../../pagination/cursor.js";
import { ValidationFailed } from "../../platform/zod.pipe.js";
import { AuditService, GrantsService } from "../access/index.js";
import { EntitlementsService } from "../entitlements/index.js";

type Row = Prisma.CourseGetPayload<object>;
type Tx = Prisma.TransactionClient;

export const STALE_MESSAGE = "This course was changed by someone else. Reload it and try again.";
const SUMMARY_LENGTH = 160;

const iso = (d: Date): string => d.toISOString();

export function toStaff(r: Row): StaffCourse {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    level: r.level,
    priceCents: r.priceCents,
    currency: "USD",
    coverTone: r.coverTone,
    status: r.status,
    version: r.version,
    publishedAt: r.publishedAt ? iso(r.publishedAt) : null,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

/** Count and average (one decimal) from the totals stored on the course row. */
export function ratingOf(r: Pick<Row, "ratingCount" | "ratingSum">): CourseRating {
  return {
    count: r.ratingCount,
    average: r.ratingCount === 0 ? null : Math.round((r.ratingSum / r.ratingCount) * 10) / 10,
  };
}

export function toPublic(r: Row): PublicCourse {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    level: r.level,
    priceCents: r.priceCents,
    currency: "USD",
    coverTone: r.coverTone,
    publishedAt: iso(r.publishedAt as Date),
  };
}

function toSummary(r: Row): PublicCourseSummary {
  const { description, ...rest } = toPublic(r);
  const summary =
    description.length > SUMMARY_LENGTH
      ? `${description.slice(0, SUMMARY_LENGTH).trimEnd()}…`
      : description;
  return { ...rest, summary, rating: ratingOf(r) };
}

/** Treats the search text as plain text: LIKE wildcards and the escape character match literally. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

interface RawRow {
  id: string;
}

@Injectable()
export class CoursesService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(GrantsService) private readonly grants: GrantsService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  // --- staff ---------------------------------------------------------------------------------

  async create(
    actorId: string,
    input: CreateCourseRequest,
    requestId: string,
  ): Promise<StaffCourse> {
    const data = createCourseRequestSchema.parse(input);
    return this.db.$transaction(async (tx) => {
      const row = await tx.course.create({ data: { ...data, createdBy: actorId } });
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actorId,
        action: "course.create",
        targetType: "course",
        targetId: row.id,
        outcome: "success",
        after: {
          title: row.title,
          level: row.level,
          priceCents: row.priceCents,
          status: row.status,
        },
        requestId,
      });
      await this.grants.grantOwnerAccess(tx, actorId, row.id, requestId);
      return toStaff(row);
    });
  }

  async getForStaff(id: string): Promise<StaffCourse> {
    const row = await this.db.course.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Course not found.");
    return toStaff(row);
  }

  async update(
    actorId: string,
    id: string,
    input: UpdateCourseRequest & { expectedVersion: number },
    requestId: string,
  ): Promise<StaffCourse> {
    const { expectedVersion, ...fields } = input;
    return this.db.$transaction(async (tx) => {
      const current = await tx.course.findUnique({ where: { id } });
      if (!current) throw new NotFoundException("Course not found.");
      if (current.version !== expectedVersion) throw new ConflictException(STALE_MESSAGE);

      const changes: Prisma.CourseUpdateManyMutationInput = {};
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const key of ["title", "description", "level", "priceCents", "coverTone"] as const) {
        const next = fields[key];
        if (next !== undefined && next !== current[key]) {
          (changes as Record<string, unknown>)[key] = next;
          before[key] = current[key];
          after[key] = next;
        }
      }
      if (Object.keys(changes).length === 0) return toStaff(current);

      // The version in the WHERE clause makes this a compare-and-swap: of two simultaneous edits
      // that started from the same version, only one matches.
      const result = await tx.course.updateMany({
        where: { id, version: expectedVersion },
        data: { ...changes, version: { increment: 1 } },
      });
      if (result.count === 0) throw new ConflictException(STALE_MESSAGE);
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actorId,
        action: "course.update",
        targetType: "course",
        targetId: id,
        outcome: "success",
        before: before as Prisma.InputJsonValue,
        after: after as Prisma.InputJsonValue,
        requestId,
      });
      return toStaff(await tx.course.findUniqueOrThrow({ where: { id } }));
    });
  }

  /** A draft must be complete before students can see it. */
  private completenessErrors(c: Row): { field: string; message: string }[] {
    const errors: { field: string; message: string }[] = [];
    if (c.title.trim().length < 3)
      errors.push({ field: "title", message: "Add a title before publishing." });
    if (c.description.trim().length === 0)
      errors.push({ field: "description", message: "Add a description before publishing." });
    return errors;
  }

  private async transition(
    tx: Tx,
    actorId: string,
    id: string,
    to: "published" | "draft",
    requestId: string,
  ): Promise<StaffCourse> {
    const current = await tx.course.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Course not found.");
    const from = to === "published" ? "draft" : "published";
    if (current.status !== from) {
      throw new ConflictException(
        to === "published" ? "This course is already published." : "This course is not published.",
      );
    }
    if (to === "published") {
      const errors = this.completenessErrors(current);
      if (errors.length > 0) throw new ValidationFailed(errors);
    }
    const result = await tx.course.updateMany({
      where: { id, version: current.version, status: from },
      data: {
        status: to,
        publishedAt: to === "published" ? new Date() : null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) throw new ConflictException(STALE_MESSAGE);
    await this.audit.record(tx, {
      actorKind: "user",
      actorUserId: actorId,
      action: to === "published" ? "course.publish" : "course.unpublish",
      targetType: "course",
      targetId: id,
      outcome: "success",
      before: { status: from },
      after: { status: to },
      requestId,
    });
    return toStaff(await tx.course.findUniqueOrThrow({ where: { id } }));
  }

  publish(actorId: string, id: string, requestId: string): Promise<StaffCourse> {
    return this.db.$transaction((tx) => this.transition(tx, actorId, id, "published", requestId));
  }

  unpublish(actorId: string, id: string, requestId: string): Promise<StaffCourse> {
    return this.db.$transaction((tx) => this.transition(tx, actorId, id, "draft", requestId));
  }

  /** `onlyCourseIds` limits the list to those courses (Instructors); omit it to list all. */
  async listForStaff(
    q: {
      status?: "draft" | "published" | undefined;
      limit?: number | undefined;
      cursor?: string | undefined;
    },
    onlyCourseIds?: readonly string[],
  ): Promise<Page<StaffCourse>> {
    const limit = q.limit ?? DEFAULT_PAGE_SIZE;
    const where: string[] = [];
    const params: unknown[] = [];
    if (onlyCourseIds) {
      params.push([...onlyCourseIds]);
      where.push(`id = ANY($${params.length}::uuid[])`);
    }
    if (q.status) {
      params.push(q.status);
      where.push(`status = $${params.length}::"CourseStatus"`);
    }
    if (q.cursor) {
      const [ts, id] = decodeCursor(q.cursor, this.config.CURSOR_SECRET);
      params.push(String(ts), String(id));
      where.push(
        `(updated_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
      );
    }
    params.push(limit + 1);
    const ids = await this.db.$queryRawUnsafe<RawRow[]>(
      `SELECT id FROM courses ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY updated_at DESC, id DESC LIMIT $${params.length}`,
      ...params,
    );
    const rows = await this.rowsInOrder(ids.map((r) => r.id));
    return this.mapPage(rows, limit, toStaff, (r) => [r.updatedAt.toISOString(), r.id]);
  }

  // --- public --------------------------------------------------------------------------------

  async listPublished(q: {
    q?: string | undefined;
    level?: string | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
  }): Promise<Page<PublicCourseSummary>> {
    const limit = q.limit ?? DEFAULT_PAGE_SIZE;
    const where: string[] = [`status = 'published'`];
    const params: unknown[] = [];
    if (q.q) {
      params.push(`%${escapeLike(q.q)}%`);
      where.push(`title ILIKE $${params.length} ESCAPE '\\'`);
    }
    if (q.level) {
      params.push(q.level);
      where.push(`level = $${params.length}::"CourseLevel"`);
    }
    if (q.cursor) {
      const [ts, id] = decodeCursor(q.cursor, this.config.CURSOR_SECRET);
      params.push(String(ts), String(id));
      where.push(
        `(published_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
      );
    }
    params.push(limit + 1);
    const ids = await this.db.$queryRawUnsafe<RawRow[]>(
      `SELECT id FROM courses WHERE ${where.join(" AND ")}
       ORDER BY published_at DESC, id DESC LIMIT $${params.length}`,
      ...params,
    );
    const rows = await this.rowsInOrder(ids.map((r) => r.id));
    return this.mapPage(rows, limit, toSummary, (r) => [
      (r.publishedAt as Date).toISOString(),
      r.id,
    ]);
  }

  /**
   * A published course, or (for a signed-in owner) a course that was unpublished since they got
   * access. Drafts and unknown ids look the same to everyone else.
   */
  async getPublished(id: string, viewerId?: string): Promise<PublicCourseDetail> {
    const row = await this.db.course.findUnique({ where: { id } });
    const owner = viewerId !== undefined ? await this.entitlements.hasActive(viewerId, id) : false;
    if (!row || (row.status !== "published" && !owner))
      throw new NotFoundException("Course not found.");
    const [counts] = await this.db.$queryRaw<{ total: bigint; previews: bigint }[]>`
      SELECT count(*) AS total, count(*) FILTER (WHERE is_preview) AS previews
      FROM lessons WHERE course_id = ${id}::uuid`;
    const onSale = row.status === "published";
    // Progress is the owner's own data: nobody else gets it, and a stranger costs no extra query.
    const [mine, next] =
      owner && viewerId !== undefined
        ? await Promise.all([
            loadCourseCounts(this.db, viewerId, [id]),
            loadNextLessonId(this.db, viewerId, id),
          ])
        : [null, null];
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      level: row.level,
      priceCents: row.priceCents,
      currency: "USD",
      coverTone: row.coverTone,
      publishedAt: row.publishedAt ? iso(row.publishedAt) : null,
      lessonCount: Number(counts?.total ?? 0),
      previewCount: Number(counts?.previews ?? 0),
      enrolled: owner,
      onSale,
      rating: ratingOf(row),
      progress: owner ? (mine?.get(id) ?? { completed: 0, total: 0 }) : null,
      nextLessonId: next,
    };
  }

  /** Throws the same 404 for a draft and an unknown course. */
  async assertPublished(id: string): Promise<void> {
    const row = await this.db.course.findFirst({
      where: { id, status: "published" },
      select: { id: true },
    });
    if (!row) throw new NotFoundException("Course not found.");
  }

  /**
   * Takes a row lock on the course for the rest of the transaction, so changes to its lesson list
   * happen one at a time. Throws 404 if the course does not exist.
   */
  async lockForUpdate(tx: Tx, id: string): Promise<void> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM courses WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException("Course not found.");
  }

  // --- helpers -------------------------------------------------------------------------------

  private async rowsInOrder(ids: string[]): Promise<Row[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.course.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((i) => byId.get(i)).filter((r): r is Row => r !== undefined);
  }

  private mapPage<T>(
    rows: Row[],
    limit: number,
    map: (r: Row) => T,
    key: (r: Row) => (string | number)[],
  ): Page<T> {
    const page = buildPage(rows, limit, key, this.config.CURSOR_SECRET);
    return { items: page.items.map(map), nextCursor: page.nextCursor };
  }
}
