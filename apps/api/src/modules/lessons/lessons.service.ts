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
import type { Prisma } from "../../generated/prisma/client.js";
import { AuditService } from "../access/index.js";
import { CoursesService } from "../courses/index.js";

type Row = Prisma.LessonGetPayload<object>;
type Tx = Prisma.TransactionClient;

export const STALE_LESSON_MESSAGE =
  "This lesson was changed by someone else. Reload it and try again.";
export const ORDER_CHANGED_MESSAGE =
  "The lessons changed while you were reordering. Reload the list and try again.";
export const LIMIT_MESSAGE = `A course can have at most ${MAX_LESSONS_PER_COURSE} lessons.`;
export const LOCKED_MESSAGE = "Enroll in this course to read this lesson.";

const iso = (d: Date): string => d.toISOString();

export function toStaffLesson(r: Row): StaffLesson {
  return {
    id: r.id,
    courseId: r.courseId,
    title: r.title,
    body: r.body,
    position: r.position,
    isPreview: r.isPreview,
    version: r.version,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

@Injectable()
export class LessonsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CoursesService) private readonly courses: CoursesService,
  ) {}

  // --- staff ---------------------------------------------------------------------------------

  async listForStaff(courseId: string): Promise<StaffLessonList> {
    const course = await this.db.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException("Course not found.");
    const rows = await this.db.lesson.findMany({
      where: { courseId },
      orderBy: { position: "asc" },
    });
    return { items: rows.map(toStaffLesson) };
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
      const row = await tx.lesson.create({
        data: {
          courseId,
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
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actorId,
        action: "lesson.create",
        targetType: "lesson",
        targetId: row.id,
        outcome: "success",
        after: { courseId, title: row.title, position: row.position, isPreview: row.isPreview },
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

  private async listInTx(tx: Tx, courseId: string): Promise<StaffLessonList> {
    const rows = await tx.lesson.findMany({ where: { courseId }, orderBy: { position: "asc" } });
    return { items: rows.map(toStaffLesson) };
  }

  // --- public --------------------------------------------------------------------------------

  async outline(courseId: string): Promise<LessonOutline> {
    await this.courses.assertPublished(courseId);
    const rows = await this.db.lesson.findMany({
      where: { courseId },
      orderBy: { position: "asc" },
      select: { id: true, title: true, position: true, isPreview: true },
    });
    return { items: rows };
  }

  /** Only free-preview lessons have a readable body until entitlements exist. */
  async readPublic(courseId: string, lessonId: string): Promise<PublicLesson> {
    await this.courses.assertPublished(courseId);
    const row = await this.db.lesson.findFirst({ where: { id: lessonId, courseId } });
    if (!row) throw new NotFoundException("Lesson not found.");
    if (!row.isPreview) {
      throw new ForbiddenException({
        message: LOCKED_MESSAGE,
        code: LESSON_ERROR_CODES.enrollmentRequired,
      });
    }
    return {
      id: row.id,
      title: row.title,
      position: row.position,
      isPreview: true,
      body: row.body,
    };
  }
}
