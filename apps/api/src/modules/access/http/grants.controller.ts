import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  grantRequestSchema,
  revokeGrantRequestSchema,
  type GrantRequest,
  type GrantResponse,
  type InstructorPermissionsResponse,
  type RevokeGrantRequest,
} from "@chartnexa/api-contracts";
import { ApiErrors, ApiZodBody } from "../../../platform/openapi-helpers.js";
import { ZodPipe } from "../../../platform/zod.pipe.js";
import { CurrentUser, Ctx, type AuthContext, type RequestCtx } from "../../identity/index.js";
import { RequirePermission } from "../authorization/require-permission.js";
import { GrantsService } from "../grants/grants.service.js";

const paramId = () => new ZodPipe(z.uuid());
const userTarget = (req: { params: unknown }): string =>
  String((req.params as { id?: string }).id ?? "unknown").slice(0, 64);

@ApiTags("staff")
@Controller("staff/instructors")
export class GrantsController {
  constructor(@Inject(GrantsService) private readonly grants: GrantsService) {}

  @Get(":id/permissions")
  @RequirePermission("instructor_permissions:manage", {
    auditDenied: { action: "grant.read", targetType: "user", target: userTarget },
  })
  @ApiOperation({ summary: "An Instructor's active permissions and what you may grant" })
  @ApiErrors(400, 404)
  list(
    @Param("id", paramId()) id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<InstructorPermissionsResponse> {
    return this.grants.list(user.userId, id);
  }

  @Post(":id/grants")
  @HttpCode(200)
  @RequirePermission("instructor_permissions:manage", {
    auditDenied: { action: "grant.create", targetType: "user", target: userTarget },
  })
  @ApiOperation({
    summary: "Give an Instructor one permission (reason required; repeating it changes nothing)",
  })
  @ApiZodBody(grantRequestSchema)
  @ApiErrors(400, 404)
  grant(
    @Param("id", paramId()) id: string,
    @Body(new ZodPipe(grantRequestSchema)) body: GrantRequest,
    @CurrentUser() user: AuthContext,
    @Ctx() ctx: RequestCtx,
  ): Promise<GrantResponse> {
    return this.grants.grant({ userId: user.userId, requestId: ctx.requestId }, id, body);
  }

  @Post(":id/grants/:grantId/revoke")
  @HttpCode(200)
  @RequirePermission("instructor_permissions:manage", {
    auditDenied: { action: "grant.revoke", targetType: "user", target: userTarget },
  })
  @ApiOperation({ summary: "Remove one permission from an Instructor (reason required)" })
  @ApiZodBody(revokeGrantRequestSchema)
  @ApiErrors(400, 404)
  async revoke(
    @Param("id", paramId()) id: string,
    @Param("grantId", paramId()) grantId: string,
    @Body(new ZodPipe(revokeGrantRequestSchema)) body: RevokeGrantRequest,
    @CurrentUser() user: AuthContext,
    @Ctx() ctx: RequestCtx,
  ): Promise<{ ok: true }> {
    await this.grants.revoke(
      { userId: user.userId, requestId: ctx.requestId },
      id,
      grantId,
      body.reason,
    );
    return { ok: true };
  }
}
