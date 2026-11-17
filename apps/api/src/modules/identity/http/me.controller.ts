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
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  changePasswordRequestSchema,
  deleteAccountRequestSchema,
  updateProfileRequestSchema,
  type ChangePasswordRequest,
  type DeleteAccountRequest,
  type MeResponse,
  type SessionSummary,
  type UpdateProfileRequest,
} from "@chartnexa/api-contracts";
import { ApiErrors, ApiZodBody } from "../../../platform/openapi-helpers.js";
import { ZodPipe } from "../../../platform/zod.pipe.js";
import { AccountsService } from "../accounts/accounts.service.js";
import { Authenticated } from "../auth.guard.js";
import { SessionsService } from "../sessions/sessions.service.js";
import {
  Ctx,
  CurrentUser,
  logEvent,
  type AuthContext,
  type RequestCtx,
} from "./request-context.js";

const OK = { status: "ok" as const };

@ApiTags("me")
@Authenticated()
@Controller("me")
export class MeController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Read your own account" })
  @ApiErrors(401)
  me(@CurrentUser() user: AuthContext): Promise<MeResponse> {
    return this.accounts.me(user.userId);
  }

  @Patch()
  @ApiOperation({ summary: "Update your display name" })
  @ApiZodBody(updateProfileRequestSchema)
  @ApiErrors(400, 401)
  update(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(updateProfileRequestSchema)) body: UpdateProfileRequest,
  ): Promise<MeResponse> {
    return this.accounts.updateProfile(user.userId, body);
  }

  @Delete()
  @HttpCode(200)
  @ApiOperation({ summary: "Delete your account (requires your password)" })
  @ApiZodBody(deleteAccountRequestSchema)
  @ApiErrors(400, 401, 429)
  async delete(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(deleteAccountRequestSchema)) body: DeleteAccountRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<typeof OK> {
    await this.accounts.deleteAccount(user.userId, body, ctx);
    return OK;
  }

  @Post("password")
  @HttpCode(200)
  @ApiOperation({ summary: "Change your password; other sessions are signed out" })
  @ApiZodBody(changePasswordRequestSchema)
  @ApiErrors(400, 401, 429)
  async changePassword(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<typeof OK> {
    await this.accounts.changePassword(user.userId, user.sessionId, body, ctx);
    return OK;
  }

  @Get("sessions")
  @ApiOperation({ summary: "List your active sessions" })
  @ApiErrors(401)
  listSessions(@CurrentUser() user: AuthContext): Promise<SessionSummary[]> {
    return this.sessions.list(user.userId, user.sessionId);
  }

  @Delete("sessions/:id")
  @HttpCode(200)
  @ApiOperation({ summary: "End one of your sessions" })
  @ApiErrors(400, 401, 404)
  async revokeSession(
    @CurrentUser() user: AuthContext,
    @Param("id", new ZodPipe(z.uuid())) id: string,
    @Ctx() ctx: RequestCtx,
  ): Promise<typeof OK> {
    await this.sessions.revokeOwn(user.userId, id);
    logEvent(ctx, "auth.session.revoked", {
      userId: user.userId,
      sessionId: id,
      outcome: "user_revoked",
    });
    return OK;
  }
}
