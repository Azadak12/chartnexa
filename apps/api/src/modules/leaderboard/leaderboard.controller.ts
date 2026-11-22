import { Body, Controller, Get, HttpCode, Inject, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  leaderboardQuerySchema,
  updateLeaderboardSettingsRequestSchema,
  type Leaderboard,
  type LeaderboardQuery,
  type LeaderboardSettings,
} from "@chartnexa/api-contracts";
import { ApiErrors, ApiZodBody } from "../../platform/openapi-helpers.js";
import { ZodPipe } from "../../platform/zod.pipe.js";
import {
  Authenticated,
  Ctx,
  CurrentUser,
  type AuthContext,
  type RequestCtx,
} from "../identity/index.js";
import { LeaderboardService } from "./leaderboard.service.js";

@ApiTags("me")
@Controller()
export class LeaderboardController {
  constructor(@Inject(LeaderboardService) private readonly svc: LeaderboardService) {}

  @Get("leaderboard")
  @Authenticated()
  @ApiOperation({ summary: "Opted-in learners ranked by verified lesson completions" })
  @ApiErrors(400, 401, 404)
  board(
    @CurrentUser() user: AuthContext,
    @Query(new ZodPipe(leaderboardQuerySchema)) q: LeaderboardQuery,
  ): Promise<Leaderboard> {
    return this.svc.board(user.userId, q);
  }

  @Get("me/leaderboard-settings")
  @Authenticated()
  @ApiOperation({ summary: "Whether you appear on the leaderboard" })
  @ApiErrors(401)
  settings(@CurrentUser() user: AuthContext): Promise<LeaderboardSettings> {
    return this.svc.settings(user.userId);
  }

  @Put("me/leaderboard-settings")
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({ summary: "Join or leave the leaderboard (joining needs a display name)" })
  @ApiZodBody(updateLeaderboardSettingsRequestSchema)
  @ApiErrors(400, 401, 409)
  update(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(updateLeaderboardSettingsRequestSchema)) body: { optedIn: boolean },
    @Ctx() ctx: RequestCtx,
  ): Promise<LeaderboardSettings> {
    return this.svc.setOptIn({ userId: user.userId, requestId: ctx.requestId }, body.optedIn);
  }
}
