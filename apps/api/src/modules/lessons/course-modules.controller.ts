import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  assignLessonModuleRequestSchema,
  createModuleRequestSchema,
  renameModuleRequestSchema,
  reorderModulesRequestSchema,
  type CreateModuleRequest,
  type RenameModuleRequest,
  type StaffLessonList,
} from "@chartnexa/api-contracts";
import { ApiErrors, ApiZodBody } from "../../platform/openapi-helpers.js";
import { ZodPipe } from "../../platform/zod.pipe.js";
import { RequirePermission } from "../access/index.js";
import { Ctx, CurrentUser, type AuthContext, type RequestCtx } from "../identity/index.js";
import { CourseModulesService } from "./course-modules.service.js";

const idPipe = () => new ZodPipe(z.uuid());
/** The course in the URL, so an Instructor's lesson grant is checked against that course only. */
const courseOf = (req: FastifyRequest) => ({
  courseId: (req.params as { courseId?: string }).courseId ?? "",
});

/** Modules use the same permission as lessons: authoring the curriculum of that course. */
@ApiTags("staff")
@Controller("staff/courses/:courseId")
export class StaffCourseModulesController {
  constructor(@Inject(CourseModulesService) private readonly modules: CourseModulesService) {}

  @Post("modules")
  @HttpCode(200)
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "Add a module at the end (at most 50 per course)" })
  @ApiZodBody(createModuleRequestSchema)
  @ApiErrors(400, 404, 409)
  create(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Body(new ZodPipe(createModuleRequestSchema)) body: CreateModuleRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffLessonList> {
    return this.modules.create({ userId: user.userId, requestId: ctx.requestId }, courseId, body);
  }

  // Declared before ":moduleId" so "order" is never read as a module id.
  @Put("modules/order")
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({
    summary: "Set the module order: every module id once; any difference answers 409",
  })
  @ApiZodBody(reorderModulesRequestSchema)
  @ApiErrors(400, 404, 409)
  reorder(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Body(new ZodPipe(reorderModulesRequestSchema)) body: { moduleIds: string[] },
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffLessonList> {
    return this.modules.reorder(
      { userId: user.userId, requestId: ctx.requestId },
      courseId,
      body.moduleIds,
    );
  }

  @Patch("modules/:moduleId")
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "Rename a module (send the version you started from)" })
  @ApiZodBody(renameModuleRequestSchema)
  @ApiErrors(400, 404, 409)
  rename(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("moduleId", idPipe()) moduleId: string,
    @Body(new ZodPipe(renameModuleRequestSchema)) body: RenameModuleRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffLessonList> {
    return this.modules.rename(
      { userId: user.userId, requestId: ctx.requestId },
      courseId,
      moduleId,
      body,
    );
  }

  @Delete("modules/:moduleId")
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "Delete a module; its lessons stay in the course without a module" })
  @ApiErrors(400, 404)
  remove(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("moduleId", idPipe()) moduleId: string,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffLessonList> {
    return this.modules.remove(
      { userId: user.userId, requestId: ctx.requestId },
      courseId,
      moduleId,
    );
  }

  @Put("lessons/:lessonId/module")
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "Move a lesson to the end of a module, or out of its module (null)" })
  @ApiZodBody(assignLessonModuleRequestSchema)
  @ApiErrors(400, 404)
  assign(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
    @Body(new ZodPipe(assignLessonModuleRequestSchema)) body: { moduleId: string | null },
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffLessonList> {
    return this.modules.assignLesson(
      { userId: user.userId, requestId: ctx.requestId },
      courseId,
      lessonId,
      body.moduleId,
    );
  }
}
