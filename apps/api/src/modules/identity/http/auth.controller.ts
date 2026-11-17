import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  forgotPasswordRequestSchema,
  loginRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
  type ForgotPasswordRequest,
  type LoginRequest,
  type RefreshRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
  type TokenPair,
  type VerifyEmailRequest,
} from "@chartnexa/api-contracts";
import { ApiErrors, ApiZodBody } from "../../../platform/openapi-helpers.js";
import { ZodPipe } from "../../../platform/zod.pipe.js";
import { AccountsService } from "../accounts/accounts.service.js";
import { Authenticated } from "../auth.guard.js";
import { AuthService } from "../auth.service.js";
import { SessionsService } from "../sessions/sessions.service.js";
import {
  Ctx,
  CurrentUser,
  logEvent,
  type AuthContext,
  type RequestCtx,
} from "./request-context.js";

const GENERIC_ACK = {
  message: "If that request can be completed, you will receive an email shortly.",
};
const OK = { status: "ok" as const };

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
  ) {}

  @Post("register")
  @HttpCode(202)
  @ApiOperation({
    summary: "Create an account (identical response whether or not the email exists)",
  })
  @ApiZodBody(registerRequestSchema)
  @ApiErrors(400, 429)
  async register(
    @Body(new ZodPipe(registerRequestSchema)) body: RegisterRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<typeof GENERIC_ACK> {
    await this.accounts.register(body, ctx);
    return GENERIC_ACK;
  }

  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Log in with email and password" })
  @ApiZodBody(loginRequestSchema)
  @ApiErrors(400, 401, 429)
  login(
    @Body(new ZodPipe(loginRequestSchema)) body: LoginRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<TokenPair> {
    return this.auth.login(body, ctx);
  }

  @Post("refresh")
  @HttpCode(200)
  @ApiOperation({ summary: "Rotate the refresh token and get a new access token" })
  @ApiZodBody(refreshRequestSchema)
  @ApiErrors(400, 401, 429)
  async refresh(
    @Body(new ZodPipe(refreshRequestSchema)) body: RefreshRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<TokenPair> {
    return this.sessions.refresh(body.refreshToken, ctx);
  }

  @Post("logout")
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({ summary: "End the current session" })
  @ApiErrors(401)
  async logout(@CurrentUser() user: AuthContext, @Ctx() ctx: RequestCtx): Promise<typeof OK> {
    await this.sessions.revokeSession(user.sessionId, "logout");
    logEvent(ctx, "auth.session.revoked", {
      userId: user.userId,
      sessionId: user.sessionId,
      outcome: "logout",
    });
    return OK;
  }

  @Post("logout-all")
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({ summary: "End every session of the current user" })
  @ApiErrors(401)
  async logoutAll(@CurrentUser() user: AuthContext, @Ctx() ctx: RequestCtx): Promise<typeof OK> {
    await this.sessions.revokeAll(user.userId, "logout_all");
    logEvent(ctx, "auth.session.revoked", { userId: user.userId, outcome: "logout_all" });
    return OK;
  }

  @Post("email/verify")
  @HttpCode(200)
  @ApiOperation({ summary: "Verify an email address with the emailed token" })
  @ApiZodBody(verifyEmailRequestSchema)
  @ApiErrors(400, 429)
  async verifyEmail(
    @Body(new ZodPipe(verifyEmailRequestSchema)) body: VerifyEmailRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<typeof OK> {
    await this.accounts.verifyEmail(body.token, ctx);
    return OK;
  }

  @Post("email/resend")
  @HttpCode(202)
  @Authenticated()
  @ApiOperation({ summary: "Send a new verification email" })
  @ApiErrors(401, 429)
  async resend(
    @CurrentUser() user: AuthContext,
    @Ctx() ctx: RequestCtx,
  ): Promise<typeof GENERIC_ACK> {
    await this.accounts.resendVerification(user.userId, ctx);
    return GENERIC_ACK;
  }

  @Post("password/forgot")
  @HttpCode(202)
  @ApiOperation({ summary: "Request a password reset email (identical response for any email)" })
  @ApiZodBody(forgotPasswordRequestSchema)
  @ApiErrors(400, 429)
  async forgot(
    @Body(new ZodPipe(forgotPasswordRequestSchema)) body: ForgotPasswordRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<typeof GENERIC_ACK> {
    await this.accounts.forgotPassword(body, ctx);
    return GENERIC_ACK;
  }

  @Post("password/reset")
  @HttpCode(200)
  @ApiOperation({ summary: "Set a new password with a reset token; signs out all sessions" })
  @ApiZodBody(resetPasswordRequestSchema)
  @ApiErrors(400, 429)
  async reset(
    @Body(new ZodPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<typeof OK> {
    await this.accounts.resetPassword(body, ctx);
    return OK;
  }
}
