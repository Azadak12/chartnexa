import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  completeMfaSetupRequestSchema,
  regenerateRecoveryCodesRequestSchema,
  resetMfaRequestSchema,
  startMfaSetupRequestSchema,
  verifyMfaRequestSchema,
  type CompleteMfaSetupRequest,
  type MfaSetupCompleteResponse,
  type MfaSetupStartResponse,
  type MfaSignInResponse,
  type MfaStatus,
  type RegenerateRecoveryCodesRequest,
  type ResetMfaRequest,
  type StartMfaSetupRequest,
  type VerifyMfaRequest,
} from "@chartnexa/api-contracts";
import { ApiErrors, ApiZodBody } from "../../platform/openapi-helpers.js";
import { ZodPipe } from "../../platform/zod.pipe.js";
import { RequirePermission } from "../access/index.js";
import {
  Authenticated,
  Ctx,
  CurrentUser,
  SessionsService,
  type AuthContext,
  type RequestCtx,
} from "../identity/index.js";
import { MfaService } from "./mfa.service.js";

@ApiTags("auth")
@Controller("auth/mfa")
export class MfaAuthController {
  constructor(
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
  ) {}

  @Post("verify")
  @HttpCode(200)
  @ApiOperation({
    summary: "Finish sign-in with an authenticator code or a recovery code (single use)",
  })
  @ApiZodBody(verifyMfaRequestSchema)
  @ApiErrors(400, 401, 429)
  async verify(
    @Body(new ZodPipe(verifyMfaRequestSchema)) body: VerifyMfaRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<MfaSignInResponse> {
    const who = await this.mfa.verify(body.challengeToken, body.code, ctx);
    const pair = await this.sessions.createSession(who.userId, ctx.deviceLabel);
    return { ...pair, recoveryCodesRemaining: who.recoveryCodesRemaining };
  }

  @Post("setup/start")
  @HttpCode(200)
  @ApiOperation({
    summary: "Get the key for a new authenticator (shown once; nothing is enabled yet)",
  })
  @ApiZodBody(startMfaSetupRequestSchema)
  @ApiErrors(400, 401, 409)
  start(
    @Body(new ZodPipe(startMfaSetupRequestSchema)) body: StartMfaSetupRequest,
  ): Promise<MfaSetupStartResponse> {
    return this.mfa.startSetup(body.challengeToken);
  }

  @Post("setup/complete")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Prove the first code, turn on two-step sign-in and get the recovery codes (shown once)",
  })
  @ApiZodBody(completeMfaSetupRequestSchema)
  @ApiErrors(400, 401, 409, 429)
  async complete(
    @Body(new ZodPipe(completeMfaSetupRequestSchema)) body: CompleteMfaSetupRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<MfaSetupCompleteResponse> {
    const done = await this.mfa.completeSetup(body.challengeToken, body.code, ctx);
    const pair = await this.sessions.createSession(done.userId, ctx.deviceLabel);
    return { ...pair, recoveryCodes: done.recoveryCodes };
  }
}

@ApiTags("me")
@Controller("me/mfa")
export class MyMfaController {
  constructor(@Inject(MfaService) private readonly mfa: MfaService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: "Whether two-step sign-in is required and on for you" })
  @ApiErrors(401)
  status(@CurrentUser() user: AuthContext): Promise<MfaStatus> {
    return this.mfa.status(user.userId);
  }

  @Post("recovery-codes")
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({ summary: "Get new recovery codes (needs your password and a current code)" })
  @ApiZodBody(regenerateRecoveryCodesRequestSchema)
  @ApiErrors(400, 401, 429)
  async regenerate(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(regenerateRecoveryCodesRequestSchema)) body: RegenerateRecoveryCodesRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<{ recoveryCodes: string[] }> {
    return { recoveryCodes: await this.mfa.regenerate(user.userId, body.password, body.code, ctx) };
  }
}

const userTarget = (req: { params: unknown }): string =>
  String((req.params as { id?: string }).id ?? "unknown").slice(0, 64);

@ApiTags("staff")
@Controller("staff/users")
export class StaffMfaController {
  constructor(@Inject(MfaService) private readonly mfa: MfaService) {}

  @Post(":id/mfa/reset")
  @HttpCode(200)
  @RequirePermission("roles:manage", {
    auditDenied: { action: "mfa.reset", targetType: "user", target: userTarget },
  })
  @ApiOperation({
    summary: "Reset someone's two-step sign-in after a lost device (Admin only, reason required)",
  })
  @ApiZodBody(resetMfaRequestSchema)
  @ApiErrors(400, 403, 404)
  reset(
    @CurrentUser() user: AuthContext,
    @Param("id", new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(resetMfaRequestSchema)) body: ResetMfaRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<{ reset: boolean }> {
    return this.mfa.reset(user.userId, id, body.reason, ctx.requestId);
  }
}
