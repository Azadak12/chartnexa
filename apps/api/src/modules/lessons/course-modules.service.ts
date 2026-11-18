import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  MAX_MODULES_PER_COURSE,
  type CreateModuleRequest,
  type RenameModuleRequest,
  type StaffLessonList,
} from "@chartnexa/api-contracts";
import { PrismaService } from "../../database/prisma.service.js";
import { AuditService } from "../access/index.js";
import { CoursesService } from "../courses/index.js";
import { assertModuleInCourse, LessonsService, renumberLessons } from "./lessons.service.js";

export interface Actor {
  userId: string;
  requestId?: string | undefined;
}

const STALE = "This module was changed by someone else. Reload it and try again.";
const ORDER_CHANGED = "The modules changed while you were reordering. Reload and try again.";

/**
 * Modules of a course. Every change locks the course row (as lesson changes do), so module and
 * lesson edits for one course happen one at a time and the reading order stays consistent.
 * Every method answers with the whole staff list so the screen can redraw from one response.
 */
@Injectable()
export class CourseModulesService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CoursesService) private readonly courses: CoursesService,
    @Inject(LessonsService) private readonly lessons: LessonsService,
  ) {}

  private record(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    actor: Actor,
    action: string,
    targetId: string,
    detail: { before?: object; after?: object },
  ) {
    return this.audit.record(tx, {
      actorKind: "user",
      actorUserId: actor.userId,
      action,
      targetType: "course_module",
      targetId,
      outcome: "success",
      ...(detail.before ? { before: detail.before } : {}),
      ...(detail.after ? { after: detail.after } : {}),
      requestId: actor.requestId ?? null,
    });
  }

  async create(
    actor: Actor,
    courseId: string,
    input: CreateModuleRequest,
  ): Promise<StaffLessonList> {
    return this.db.$transaction(async (tx) => {
      await this.courses.lockForUpdate(tx, courseId);
      const count = await tx.courseModule.count({ where: { courseId } });
      if (count >= MAX_MODULES_PER_COURSE) {
        throw new ConflictException(`A course can have at most ${MAX_MODULES_PER_COURSE} modules.`);
      }
      const row = await tx.courseModule.create({
        data: { courseId, title: input.title.trim(), position: count + 1 },
      });
      await this.record(tx, actor, "module.create", row.id, {
        after: { courseId, title: row.title, position: row.position },
      });
      return this.lessons.listInTx(tx, courseId);
    });
  }

  async rename(
    actor: Actor,
    courseId: string,
    moduleId: string,
    input: RenameModuleRequest,
  ): Promise<StaffLessonList> {
    return this.db.$transaction(async (tx) => {
      await this.courses.lockForUpdate(tx, courseId);
      const current = await tx.courseModule.findFirst({ where: { id: moduleId, courseId } });
      if (!current) throw new NotFoundException("Module not found.");
      if (current.version !== input.expectedVersion) throw new ConflictException(STALE);
      const title = input.title.trim();
      if (title !== current.title) {
        await tx.courseModule.update({
          where: { id: moduleId },
          data: { title, version: { increment: 1 } },
        });
        await this.record(tx, actor, "module.rename", moduleId, {
          before: { title: current.title },
          after: { title },
        });
      }
      return this.lessons.listInTx(tx, courseId);
    });
  }

  /** The module goes; its lessons stay in the course without a module. Repeating it succeeds. */
  async remove(actor: Actor, courseId: string, moduleId: string): Promise<StaffLessonList> {
    return this.db.$transaction(async (tx) => {
      await this.courses.lockForUpdate(tx, courseId);
      const current = await tx.courseModule.findFirst({ where: { id: moduleId, courseId } });
      if (current) {
        const lessonCount = await tx.lesson.count({ where: { moduleId } });
        await tx.courseModule.delete({ where: { id: moduleId } });
        await tx.$executeRaw`UPDATE course_modules SET position = position - 1
          WHERE course_id = ${courseId}::uuid AND position > ${current.position}`;
        await renumberLessons(tx, courseId);
        await this.record(tx, actor, "module.delete", moduleId, {
          before: { courseId, title: current.title, position: current.position, lessonCount },
        });
      }
      return this.lessons.listInTx(tx, courseId);
    });
  }

  /** The full new order. A list that no longer matches the course's modules answers 409. */
  async reorder(actor: Actor, courseId: string, moduleIds: string[]): Promise<StaffLessonList> {
    return this.db.$transaction(async (tx) => {
      await this.courses.lockForUpdate(tx, courseId);
      const current = await tx.courseModule.findMany({
        where: { courseId },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      const have = new Set(current.map((m) => m.id));
      const same =
        have.size === moduleIds.length &&
        new Set(moduleIds).size === moduleIds.length &&
        moduleIds.every((id) => have.has(id));
      if (!same) throw new ConflictException(ORDER_CHANGED);
      if (!current.every((m, i) => m.id === moduleIds[i])) {
        const positions = moduleIds.map((_, i) => i + 1);
        await tx.$executeRaw`UPDATE course_modules AS m SET position = v.pos, updated_at = now()
          FROM unnest(${moduleIds}::uuid[], ${positions}::int[]) AS v(id, pos)
          WHERE m.id = v.id AND m.course_id = ${courseId}::uuid`;
        await renumberLessons(tx, courseId);
        await this.record(tx, actor, "module.reorder", courseId, {
          before: { moduleIds: current.map((m) => m.id) },
          after: { moduleIds },
        });
      }
      return this.lessons.listInTx(tx, courseId);
    });
  }

  /** Moves a lesson into a module (at its end) or out of every module. Moving it again is a no-op. */
  async assignLesson(
    actor: Actor,
    courseId: string,
    lessonId: string,
    moduleId: string | null,
  ): Promise<StaffLessonList> {
    return this.db.$transaction(async (tx) => {
      await this.courses.lockForUpdate(tx, courseId);
      const lesson = await tx.lesson.findFirst({ where: { id: lessonId, courseId } });
      if (!lesson) throw new NotFoundException("Lesson not found.");
      if (moduleId) await assertModuleInCourse(tx, courseId, moduleId);
      if (lesson.moduleId !== moduleId) {
        await tx.lesson.update({
          where: { id: lessonId },
          data: { moduleId, version: { increment: 1 } },
        });
        await renumberLessons(tx, courseId, lessonId);
        await this.record(tx, actor, "lesson.move", lessonId, {
          before: { moduleId: lesson.moduleId },
          after: { moduleId },
        });
      }
      return this.lessons.listInTx(tx, courseId);
    });
  }
}
