import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  LESSON_ERROR_CODES,
  MAX_LESSONS_PER_COURSE,
  type CreateLessonRequest,
  type LessonOutline,
  type PublicLesson,
  type StaffLesson,
  type StaffLessonList,
  type UpdateLessonRequest,
} from "@chartnexa/api-contracts";
import { PrismaService } from "../../database/prisma.service.js";
import { ValidationFailed } from "../../platform/zod.pipe.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { AuditService } from "../access/index.js";
import { CoursesService } from "../courses/index.js";
import { EntitlementsService } from "../entitlements/index.js";

type Row = Prisma.LessonGetPayload<object>;
type Tx = Prisma.TransactionClient;

export const STALE_LESSON_MESSAGE =
  "This lesson was changed by someone else. Reload it and try again.";
export const ORDER_CHANGED_MESSAGE =
  "The lessons changed while you were reordering. Reload the list and try again.";
export const LIMIT_MESSAGE = `A course can have at most ${MAX_LESSONS_PER_COURSE} lessons.`;
export const LOCKED_MESSAGE = "Enroll in this course to read this lesson.";

const iso = (d: Date): string => d.toISOString();

/**
 * Rewrites lesson positions 1..n so the reading order is grouped by module order: lessons without
 * a module first, then each module's lessons, each group in its existing order. `lastId` puts one
 * lesson at the end of its group (a lesson just added or moved into a module). Positions are a
 * deferred unique pair, so the whole rewrite is checked at commit.
 */
export async function renumberLessons(tx: Tx, courseId: string, lastId?: string): Promise<void> {
  const last = lastId ?? "00000000-0000-0000-0000-000000000000";
  await tx.$executeRaw`UPDATE lessons AS l SET position = o.rn, updated_at = now()
    FROM (
      SELECT l2.id, row_number() OVER (
        ORDER BY m.position ASC NULLS FIRST, (l2.id = ${last}::uuid) ASC, l2.position ASC, l2.id ASC
      )::int AS rn
      FROM lessons l2 LEFT JOIN course_modules m ON m.id = l2.module_id
      WHERE l2.course_id = ${courseId}::uuid
    ) AS o
    WHERE l.id = o.id AND l.position <> o.rn`;
}

export function toStaffLesson(r: Row): StaffLesson {
  return {
    id: r.id,
    courseId: r.courseId,
    moduleId: r.moduleId,
    title: r.title,
    body: r.body,
    position: r.position,
    isPreview: r.isPreview,
    version: r.version,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

/** A module id must name a module of this course; otherwise it is a field error. */
export async function assertModuleInCourse(
  tx: Tx,
  courseId: string,
  moduleId: string,
): Promise<void> {
  const found = await tx.courseModule.findFirst({
    where: { id: moduleId, courseId },
    select: { id: true },
  });
  if (!found) {
    throw new ValidationFailed([{ field: "moduleId", message: "Choose a module of this course" }]);
  }
}

@Injectable()
export class LessonsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CoursesService) private readonly courses: CoursesService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
  ) {}

  // --- staff ---------------------------------------------------------------------------------

  async listForStaff(courseId: string): Promise<StaffLessonList> {
    const course = await this.db.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException("Course not found.");
    return this.listInTx(this.db, courseId);
  }

  async getForStaff(courseId: string, lessonId: string): Promise<StaffLesson> {
    const row = await this.db.lesson.findFirst({ where: { id: lessonId, courseId } });
    if (!row) throw new NotFoundException("Lesson not found.");
    return toStaffLesson(row);
  }

  /** Adds at the end. The same idempotency key for the same course returns the same lesson. */
  async create(
    actorId: string,
    courseId: string,
    input: CreateLessonRequest & { body: string; isPreview: boolean },
    requestId: string,
  ): Promise<StaffLesson> {
    return this.db.$transaction(async (tx) => {
      await this.courses.lockForUpdate(tx, courseId);

      const seen = await tx.lessonCreateKey.findUnique({
        where: { courseId_key: { courseId, key: input.idempotencyKey } },
        include: { lesson: true },
      });
      if (seen) return toStaffLesson(seen.lesson);

      const count = await tx.lesson.count({ where: { courseId } });
      if (count >= MAX_LESSONS_PER_COURSE) {
        throw new ConflictException({
          message: LIMIT_MESSAGE,
          code: LESSON_ERROR_CODES.limitReached,
        });
      }
      const moduleId = input.moduleId ?? null;
      if (moduleId) await assertModuleInCourse(tx, courseId, moduleId);
      let row = await tx.lesson.create({
        data: {
          courseId,
          moduleId,
          title: input.title,
          body: input.body,
          isPreview: input.isPreview,
          position: count + 1,
          createdBy: actorId,
        },
      });
      await tx.lessonCreateKey.create({
        data: { courseId, key: input.idempotencyKey, lessonId: row.id },
      });
      // The new lesson goes to the end of its group (its module, or the lessons without one).
      await renumberLessons(tx, courseId, row.id);
      row = await tx.lesson.findUniqueOrThrow({ where: { id: row.id } });
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actorId,
        action: "lesson.create",
        targetType: "lesson",
        targetId: row.id,
        outcome: "success",
        after: {
          courseId,
          title: row.title,
          position: row.position,
          isPreview: row.isPreview,
          moduleId: row.moduleId,
        },
        requestId,
      });
      return toStaffLesson(row);
    });
  }

  async update(
    actorId: string,
    courseId: string,
    lessonId: string,
    input: UpdateLessonRequest & { expectedVersion: number },
    requestId: string,
  ): Promise<StaffLesson> {
    const { expectedVersion, ...fields } = input;
    return this.db.$transaction(async (tx) => {
      const current = await tx.lesson.findFirst({ where: { id: lessonId, courseId } });
      if (!current) throw new NotFoundException("Lesson not found.");
      if (current.version !== expectedVersion) throw new ConflictException(STALE_LESSON_MESSAGE);

      const changes: Prisma.LessonUpdateManyMutationInput = {};
      const changed: string[] = [];
      for (const key of ["title", "body", "isPreview"] as const) {
        const next = fields[key];
        if (next !== undefined && next !== current[key]) {
          (changes as Record<string, unknown>)[key] = next;
          changed.push(key);
        }
      }
      if (changed.length === 0) return toStaffLesson(current);

      // The version in the WHERE clause makes this a compare-and-swap: of two simultaneous edits
      // that started from the same version, only one matches.
      const result = await tx.lesson.updateMany({
        where: { id: lessonId, courseId, version: expectedVersion },
        data: { ...changes, version: { increment: 1 } },
      });
      if (result.count === 0) {
        const still = await tx.lesson.count({ where: { id: lessonId, courseId } });
        if (still === 0) throw new NotFoundException("Lesson not found.");
        throw new ConflictException(STALE_LESSON_MESSAGE);
      }
      // Never the text itself: only which fields changed (and the preview flag, which is not text).
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actorId,
        action: "lesson.update",
        targetType: "lesson",
        targetId: lessonId,
        outcome: "success",
        before: { ...(changed.includes("isPreview") ? { isPreview: current.isPreview } : {}) },
        after: {
          courseId,
          changedFields: changed,
          ...(changed.includes("isPreview") ? { isPreview: fields.isPreview as boolean } : {}),
        },
        requestId,
      });
      return toStaffLesson(await tx.lesson.findUniqueOrThrow({ where: { id: lessonId } }));
    });
  }

  /** Removes the lesson for good and closes the gap it leaves. */
  async remove(
    actorId: string,
    courseId: string,
    lessonId: string,
    requestId: string,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await this.courses.lockForUpdate(tx, courseId);
      const row = await tx.lesson.findFirst({ where: { id: lessonId, courseId } });
      if (!row) throw new NotFoundException("Lesson not found.");
      await tx.lesson.delete({ where: { id: lessonId } });
      await tx.$executeRaw`UPDATE lessons SET position = position - 1
        WHERE course_id = ${courseId}::uuid AND position > ${row.position}`;
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actorId,
        action: "lesson.delete",
        targetType: "lesson",
        targetId: lessonId,
        outcome: "success",
        before: { courseId, title: row.title, position: row.position, isPreview: row.isPreview },
        requestId,
      });
    });
  }

  /** `lessonIds` must be exactly the course's current lessons, in the wanted order. */
  async reorder(
    actorId: string,
    courseId: string,
    lessonIds: string[],
    requestId: string,
  ): Promise<StaffLessonList> {
    return this.db.$transaction(async (tx) => {
      await this.courses.lockForUpdate(tx, courseId);
      const current = await tx.lesson.findMany({
        where: { courseId },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      const have = new Set(current.map((r) => r.id));
      const same = have.size === lessonIds.length && lessonIds.every((id) => have.has(id));
      if (!same) {
        throw new ConflictException({
          message: ORDER_CHANGED_MESSAGE,
          code: LESSON_ERROR_CODES.orderChanged,
        });
      }
      const unchanged = current.every((r, i) => r.id === lessonIds[i]);
      if (!unchanged) {
        const positions = lessonIds.map((_, i) => i + 1);
        await tx.$executeRaw`UPDATE lessons AS l SET position = v.pos, updated_at = now()
          FROM unnest(${lessonIds}::uuid[], ${positions}::int[]) AS v(id, pos)
          WHERE l.id = v.id AND l.course_id = ${courseId}::uuid`;
        // Lessons stay grouped by module: the new order applies inside each module.
        await renumberLessons(tx, courseId);
        await this.audit.record(tx, {
          actorKind: "user",
          actorUserId: actorId,
          action: "lesson.reorder",
          targetType: "course",
          targetId: courseId,
          outcome: "success",
          before: { lessonIds: current.map((r) => r.id) },
          after: { lessonIds },
          requestId,
        });
      }
      return this.listInTx(tx, courseId);
    });
  }

  async listInTx(tx: Tx | PrismaService, courseId: string): Promise<StaffLessonList> {
    const [rows, modules] = await Promise.all([
      tx.lesson.findMany({ where: { courseId }, orderBy: { position: "asc" } }),
      tx.courseModule.findMany({ where: { courseId }, orderBy: { position: "asc" } }),
    ]);
    return {
      items: rows.map(toStaffLesson),
      modules: modules.map((m) => ({
        id: m.id,
        title: m.title,
        position: m.position,
        version: m.version,
      })),
    };
  }

  // --- public --------------------------------------------------------------------------------

  /** Published courses are open to everyone; an unpublished one only to its owners. */
  private async assertVisible(courseId: string, viewerId?: string): Promise<boolean> {
    try {
      await this.courses.assertPublished(courseId);
    } catch (e) {
      if (e instanceof NotFoundException && viewerId !== undefined) {
        if (await this.entitlements.hasActive(viewerId, courseId)) return true;
      }
      throw e;
    }
    return false;
  }

  async outline(courseId: string, viewerId?: string): Promise<LessonOutline> {
    await this.assertVisible(courseId, viewerId);
    const [rows, modules] = await Promise.all([
      this.db.lesson.findMany({
        where: { courseId },
        orderBy: { position: "asc" },
        select: { id: true, title: true, position: true, isPreview: true, moduleId: true },
      }),
      this.db.courseModule.findMany({
        where: { courseId },
        orderBy: { position: "asc" },
        select: { id: true, title: true, position: true },
      }),
    ]);
    return { items: rows, modules };
  }

  /** Free previews are open to everyone; every other lesson needs an active entitlement. */
  async readPublic(courseId: string, lessonId: string, viewerId?: string): Promise<PublicLesson> {
    const ownerOfUnpublished = await this.assertVisible(courseId, viewerId);
    const row = await this.db.lesson.findFirst({ where: { id: lessonId, courseId } });
    if (!row) throw new NotFoundException("Lesson not found.");
    if (!row.isPreview) {
      const owner =
        ownerOfUnpublished ||
        (viewerId !== undefined && (await this.entitlements.hasActive(viewerId, courseId)));
      if (!owner) {
        throw new ForbiddenException({
          message: LOCKED_MESSAGE,
          code: LESSON_ERROR_CODES.enrollmentRequired,
        });
      }
    }
    return {
      id: row.id,
      title: row.title,
      position: row.position,
      isPreview: row.isPreview,
      moduleId: row.moduleId,
      body: row.body,
    };
  }
}
