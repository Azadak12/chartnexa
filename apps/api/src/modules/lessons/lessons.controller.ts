import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  createLessonRequestSchema,
  reorderLessonsRequestSchema,
  updateLessonRequestSchema,
  type CreateLessonRequest,
  type LessonOutline,
  type PublicLesson,
  type ReorderLessonsRequest,
  type StaffLesson,
  type StaffLessonList,
  type UpdateLessonRequest,
} from "@chartnexa/api-contracts";
import type { FastifyRequest } from "fastify";
import { ApiErrors, ApiZodBody } from "../../platform/openapi-helpers.js";
import { ZodPipe } from "../../platform/zod.pipe.js";
import { RequirePermission } from "../access/index.js";
import { Ctx, CurrentUser, type AuthContext, type RequestCtx } from "../identity/index.js";
import { LessonsService } from "./lessons.service.js";

const idPipe = () => new ZodPipe(z.uuid());
/** The course in the URL, so an Instructor's grant is checked against that course only. */
const courseOf = (req: FastifyRequest) => ({
  courseId: (req.params as { courseId?: string }).courseId ?? "",
});

@ApiTags("courses")
@Controller("courses/:courseId/lessons")
export class PublicLessonsController {
  constructor(@Inject(LessonsService) private readonly lessons: LessonsService) {}

  @Get()
  @ApiOperation({
    summary:
      "Lesson outline of a published course (anyone): titles, order, preview flags, no text.",
  })
  @ApiErrors(400, 404)
  outline(@Param("courseId", idPipe()) courseId: string): Promise<LessonOutline> {
    return this.lessons.outline(courseId);
  }

  @Get(":lessonId")
  @ApiOperation({
    summary: "Read a free-preview lesson (anyone). Other lessons answer 403 ENROLLMENT_REQUIRED.",
  })
  @ApiErrors(400, 403, 404)
  read(
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
  ): Promise<PublicLesson> {
    return this.lessons.readPublic(courseId, lessonId);
  }
}

@ApiTags("staff")
@Controller("staff/courses/:courseId/lessons")
export class StaffLessonsController {
  constructor(@Inject(LessonsService) private readonly lessons: LessonsService) {}

  @Get()
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "All lessons of a course in order, with text, whatever its status" })
  @ApiErrors(400, 404)
  list(@Param("courseId", idPipe()) courseId: string): Promise<StaffLessonList> {
    return this.lessons.listForStaff(courseId);
  }

  @Post()
  @HttpCode(201)
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({
    summary: "Add a lesson at the end; repeating the same idempotencyKey returns the same lesson",
  })
  @ApiZodBody(createLessonRequestSchema)
  @ApiErrors(400, 404, 409)
  create(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Body(new ZodPipe(createLessonRequestSchema)) body: CreateLessonRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffLesson> {
    return this.lessons.create(
      user.userId,
      courseId,
      body as CreateLessonRequest & { body: string; isPreview: boolean },
      ctx.requestId,
    );
  }

  // Declared before the ":lessonId" routes so "order" is never read as a lesson id.
  @Put("order")
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({
    summary: "Set the order: send every lesson id of the course once; any difference answers 409",
  })
  @ApiZodBody(reorderLessonsRequestSchema)
  @ApiErrors(400, 404, 409)
  reorder(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Body(new ZodPipe(reorderLessonsRequestSchema)) body: ReorderLessonsRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffLessonList> {
    return this.lessons.reorder(user.userId, courseId, body.lessonIds, ctx.requestId);
  }

  @Get(":lessonId")
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "Open one lesson with its text" })
  @ApiErrors(400, 404)
  get(
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
  ): Promise<StaffLesson> {
    return this.lessons.getForStaff(courseId, lessonId);
  }

  @Patch(":lessonId")
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "Edit a lesson; the version you started from must still be current" })
  @ApiZodBody(updateLessonRequestSchema)
  @ApiErrors(400, 404, 409)
  update(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
    @Body(new ZodPipe(updateLessonRequestSchema)) body: UpdateLessonRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffLesson> {
    return this.lessons.update(
      user.userId,
      courseId,
      lessonId,
      body as UpdateLessonRequest & { expectedVersion: number },
      ctx.requestId,
    );
  }

  @Delete(":lessonId")
  @HttpCode(204)
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "Delete a lesson for good; later lessons move up" })
  @ApiErrors(400, 404)
  async remove(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
    @Ctx() ctx: RequestCtx,
  ): Promise<void> {
    await this.lessons.remove(user.userId, courseId, lessonId, ctx.requestId);
  }
}
