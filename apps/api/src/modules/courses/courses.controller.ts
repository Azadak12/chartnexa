import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  catalogQuerySchema,
  createCourseRequestSchema,
  staffCourseQuerySchema,
  updateCourseRequestSchema,
  type CatalogQuery,
  type CreateCourseRequest,
  type Page,
  type PublicCourse,
  type PublicCourseSummary,
  type StaffCourse,
  type StaffCourseQuery,
  type UpdateCourseRequest,
} from "@chartnexa/api-contracts";
import { ApiErrors, ApiZodBody } from "../../platform/openapi-helpers.js";
import { ZodPipe } from "../../platform/zod.pipe.js";
import { RequirePermission } from "../access/index.js";
import { Ctx, CurrentUser, type AuthContext, type RequestCtx } from "../identity/index.js";
import { CoursesService } from "./courses.service.js";

const idPipe = () => new ZodPipe(z.uuid());

@ApiTags("courses")
@Controller("courses")
export class CoursesController {
  constructor(@Inject(CoursesService) private readonly courses: CoursesService) {}

  @Get()
  @ApiOperation({
    summary: "List published courses (anyone). Search by title, filter by level, newest first.",
  })
  @ApiErrors(400)
  list(
    @Query(new ZodPipe(catalogQuerySchema)) q: CatalogQuery,
  ): Promise<Page<PublicCourseSummary>> {
    return this.courses.listPublished(q);
  }

  @Get(":id")
  @ApiOperation({ summary: "Open one published course (anyone). Drafts answer 404." })
  @ApiErrors(400, 404)
  get(@Param("id", idPipe()) id: string): Promise<PublicCourse> {
    return this.courses.getPublished(id);
  }
}

@ApiTags("staff")
@Controller("staff/courses")
export class StaffCoursesController {
  constructor(@Inject(CoursesService) private readonly courses: CoursesService) {}

  @Post()
  @HttpCode(201)
  @RequirePermission("course:create")
  @ApiOperation({ summary: "Create a draft course" })
  @ApiZodBody(createCourseRequestSchema)
  @ApiErrors(400)
  create(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(createCourseRequestSchema)) body: CreateCourseRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffCourse> {
    return this.courses.create(user.userId, body, ctx.requestId);
  }

  @Get()
  @RequirePermission("course:update")
  @ApiOperation({ summary: "List courses of every status, newest change first" })
  @ApiErrors(400)
  list(
    @Query(new ZodPipe(staffCourseQuerySchema)) q: StaffCourseQuery,
  ): Promise<Page<StaffCourse>> {
    return this.courses.listForStaff(q);
  }

  @Get(":id")
  @RequirePermission("course:update")
  @ApiOperation({ summary: "Open any course" })
  @ApiErrors(400, 404)
  get(@Param("id", idPipe()) id: string): Promise<StaffCourse> {
    return this.courses.getForStaff(id);
  }

  @Patch(":id")
  @RequirePermission("course:update")
  @ApiOperation({ summary: "Edit a course; the version you started from must still be current" })
  @ApiZodBody(updateCourseRequestSchema)
  @ApiErrors(400, 404, 409)
  update(
    @CurrentUser() user: AuthContext,
    @Param("id", idPipe()) id: string,
    @Body(new ZodPipe(updateCourseRequestSchema)) body: UpdateCourseRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffCourse> {
    return this.courses.update(
      user.userId,
      id,
      body as UpdateCourseRequest & { expectedVersion: number },
      ctx.requestId,
    );
  }

  @Post(":id/publish")
  @HttpCode(200)
  @RequirePermission("course:publish")
  @ApiOperation({ summary: "Publish a complete draft" })
  @ApiErrors(400, 404, 409)
  publish(
    @CurrentUser() user: AuthContext,
    @Param("id", idPipe()) id: string,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffCourse> {
    return this.courses.publish(user.userId, id, ctx.requestId);
  }

  @Post(":id/unpublish")
  @HttpCode(200)
  @RequirePermission("course:publish")
  @ApiOperation({ summary: "Return a published course to draft" })
  @ApiErrors(404, 409)
  unpublish(
    @CurrentUser() user: AuthContext,
    @Param("id", idPipe()) id: string,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffCourse> {
    return this.courses.unpublish(user.userId, id, ctx.requestId);
  }
}
