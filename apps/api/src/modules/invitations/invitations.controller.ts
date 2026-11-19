import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  acceptInvitationRequestSchema,
  createInvitationRequestSchema,
  deactivateInstructorRequestSchema,
  invitationQuerySchema,
  type AcceptInvitationRequest,
  type CreateInvitationRequest,
  type DeactivateInstructorResponse,
  type InstructorSummary,
  type Invitation,
  type InvitationQuery,
  type Page,
} from "@chartnexa/api-contracts";
import { ApiErrors, ApiZodBody } from "../../platform/openapi-helpers.js";
import { ZodPipe } from "../../platform/zod.pipe.js";
import { RequirePermission, RolesService } from "../access/index.js";
import { Ctx, CurrentUser, type AuthContext, type RequestCtx } from "../identity/index.js";
import { InvitationsService } from "./invitations.service.js";

const idPipe = () => new ZodPipe(z.uuid());

@ApiTags("staff")
@Controller("staff")
export class StaffInvitationsController {
  constructor(
    @Inject(InvitationsService) private readonly invites: InvitationsService,
    @Inject(RolesService) private readonly roles: RolesService,
  ) {}

  @Get("instructor-invitations")
  @RequirePermission("instructors:invite")
  @ApiOperation({ summary: "Invitations (Admins see all; Managers see the ones they sent)" })
  @ApiErrors(400)
  list(
    @CurrentUser() user: AuthContext,
    @Query(new ZodPipe(invitationQuerySchema)) q: InvitationQuery,
  ): Promise<Page<Invitation>> {
    return this.invites.list({ userId: user.userId }, q);
  }

  @Post("instructor-invitations")
  @HttpCode(201)
  @RequirePermission("instructors:invite")
  @ApiOperation({ summary: "Invite someone to be an Instructor (they get an email link)" })
  @ApiZodBody(createInvitationRequestSchema)
  @ApiErrors(400, 409, 429)
  create(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(createInvitationRequestSchema)) body: CreateInvitationRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<Invitation> {
    return this.invites.create({ userId: user.userId, requestId: ctx.requestId }, body);
  }

  @Post("instructor-invitations/:id/resend")
  @HttpCode(200)
  @RequirePermission("instructors:invite")
  @ApiOperation({ summary: "Send an open invitation again with a new code and expiry" })
  @ApiErrors(404, 409, 429)
  resend(
    @CurrentUser() user: AuthContext,
    @Param("id", idPipe()) id: string,
    @Ctx() ctx: RequestCtx,
  ): Promise<Invitation> {
    return this.invites.resend({ userId: user.userId, requestId: ctx.requestId }, id);
  }

  @Delete("instructor-invitations/:id")
  @HttpCode(200)
  @RequirePermission("instructors:invite")
  @ApiOperation({ summary: "Revoke an open invitation (repeating it changes nothing)" })
  @ApiErrors(404, 409)
  revoke(
    @CurrentUser() user: AuthContext,
    @Param("id", idPipe()) id: string,
    @Ctx() ctx: RequestCtx,
  ): Promise<Invitation> {
    return this.invites.revoke({ userId: user.userId, requestId: ctx.requestId }, id);
  }

  @Get("instructors")
  @RequirePermission("users:read")
  @ApiOperation({ summary: "People who currently hold the Instructor role" })
  listInstructors(): Promise<{ items: InstructorSummary[] }> {
    return this.invites.listInstructors();
  }

  @Post("instructors/:userId/deactivate")
  @HttpCode(200)
  @RequirePermission("roles:manage", {
    auditDenied: {
      action: "instructor.deactivate",
      targetType: "user",
      target: (req) => (req.params as { userId?: string }).userId ?? "unknown",
    },
  })
  @ApiOperation({
    summary:
      "Deactivate an Instructor (Admin only): role, permissions and sessions end; records stay",
  })
  @ApiZodBody(deactivateInstructorRequestSchema)
  @ApiErrors(400, 404, 409)
  async deactivate(
    @CurrentUser() user: AuthContext,
    @Param("userId", idPipe()) userId: string,
    @Body(new ZodPipe(deactivateInstructorRequestSchema)) body: { reason: string },
    @Ctx() ctx: RequestCtx,
  ): Promise<DeactivateInstructorResponse> {
    const r = await this.roles.deactivateInstructor(
      { userId: user.userId, requestId: ctx.requestId },
      userId,
      body.reason,
    );
    return { userId, ...r };
  }
}

@ApiTags("auth")
@Controller("auth")
export class AcceptInvitationController {
  constructor(@Inject(InvitationsService) private readonly invites: InvitationsService) {}

  @Post("instructor-invitations/accept")
  @HttpCode(200)
  @ApiOperation({ summary: "Accept an Instructor invitation (creates the account if needed)" })
  @ApiZodBody(acceptInvitationRequestSchema)
  @ApiErrors(400, 409, 429)
  accept(
    @Body(new ZodPipe(acceptInvitationRequestSchema)) body: AcceptInvitationRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<{ email: string }> {
    return this.invites.accept(body, ctx);
  }
}
