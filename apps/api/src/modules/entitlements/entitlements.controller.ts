import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  entitlementPageQuerySchema,
  grantEntitlementRequestSchema,
  revokeEntitlementRequestSchema,
  type CourseStudent,
  type Entitlement,
  type EntitlementPageQuery,
  type GrantEntitlementRequest,
  type GrantEntitlementResponse,
  type MyCourse,
  type Page,
  type RevokeEntitlementRequest,
} from "@chartnexa/api-contracts";
import type { FastifyRequest } from "fastify";
import { ApiErrors, ApiZodBody } from "../../platform/openapi-helpers.js";
import { ZodPipe } from "../../platform/zod.pipe.js";
import { RequirePermission } from "../access/index.js";
import {
  Authenticated,
  Ctx,
  CurrentUser,
  type AuthContext,
  type RequestCtx,
} from "../identity/index.js";
import { EntitlementsService } from "./entitlements.service.js";

const idPipe = () => new ZodPipe(z.uuid());
const courseTarget = (req: FastifyRequest): string =>
  String((req.params as { courseId?: string }).courseId ?? "unknown").slice(0, 64);

@ApiTags("staff")
@Controller("staff/courses/:courseId/entitlements")
export class StaffEntitlementsController {
  constructor(@Inject(EntitlementsService) private readonly entitlements: EntitlementsService) {}

  @Get()
  @RequirePermission("enrollments:manage")
  @ApiOperation({ summary: "People with active access to a course, newest first" })
  @ApiErrors(400, 404)
  list(
    @Param("courseId", idPipe()) courseId: string,
    @Query(new ZodPipe(entitlementPageQuerySchema)) q: EntitlementPageQuery,
  ): Promise<Page<CourseStudent>> {
    return this.entitlements.listForCourse(courseId, q);
  }

  @Post()
  @HttpCode(200)
  @RequirePermission("enrollments:manage", {
    auditDenied: { action: "entitlement.grant", targetType: "course", target: courseTarget },
  })
  @ApiOperation({
    summary: "Give a person access to a course (reason required; repeating it changes nothing)",
  })
  @ApiZodBody(grantEntitlementRequestSchema)
  @ApiErrors(400, 404, 409)
  grant(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Body(new ZodPipe(grantEntitlementRequestSchema)) body: GrantEntitlementRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<GrantEntitlementResponse> {
    return this.entitlements.grant(
      { userId: user.userId, requestId: ctx.requestId },
      courseId,
      body,
    );
  }

  @Post(":entitlementId/revoke")
  @HttpCode(200)
  @RequirePermission("enrollments:manage", {
    auditDenied: { action: "entitlement.revoke", targetType: "course", target: courseTarget },
  })
  @ApiOperation({
    summary: "End a person's access now (reason required; repeating it changes nothing)",
  })
  @ApiZodBody(revokeEntitlementRequestSchema)
  @ApiErrors(400, 404)
  revoke(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("entitlementId", idPipe()) entitlementId: string,
    @Body(new ZodPipe(revokeEntitlementRequestSchema)) body: RevokeEntitlementRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<Entitlement> {
    return this.entitlements.revoke(
      { userId: user.userId, requestId: ctx.requestId },
      courseId,
      entitlementId,
      body.reason,
    );
  }
}

@ApiTags("me")
@Controller("me/courses")
export class MyCoursesController {
  constructor(@Inject(EntitlementsService) private readonly entitlements: EntitlementsService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: "The courses you have access to, newest first" })
  @ApiErrors(400, 401)
  list(
    @CurrentUser() user: AuthContext,
    @Query(new ZodPipe(entitlementPageQuerySchema)) q: EntitlementPageQuery,
  ): Promise<Page<MyCourse>> {
    return this.entitlements.listMine(user.userId, q);
  }
}
