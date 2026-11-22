import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  createTipRequestSchema,
  type CreateTipRequest,
  type StaffTip,
  type TipOfTheDay,
} from "@chartnexa/api-contracts";
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
import { TipsService } from "./tips.service.js";

@ApiTags("me")
@Controller("me/tip-of-the-day")
export class MyTipController {
  constructor(@Inject(TipsService) private readonly svc: TipsService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: "Today's tip (the same all day, UTC), or null when none exist" })
  @ApiErrors(401)
  today(): Promise<TipOfTheDay> {
    return this.svc.ofTheDay();
  }
}

/** Managed with the same permission that lets staff publish announcements to everyone. */
@ApiTags("staff")
@Controller("staff/tips")
export class StaffTipsController {
  constructor(@Inject(TipsService) private readonly svc: TipsService) {}

  @Get()
  @RequirePermission("announcements:publish")
  @ApiOperation({ summary: "Every tip, newest first, active and archived" })
  @ApiErrors(401, 403)
  async list(): Promise<{ items: StaffTip[] }> {
    return { items: await this.svc.listStaff() };
  }

  @Post()
  @HttpCode(200)
  @RequirePermission("announcements:publish")
  @ApiOperation({ summary: "Add a plain-text tip, optionally linked to a published course" })
  @ApiZodBody(createTipRequestSchema)
  @ApiErrors(400, 401, 403, 404)
  create(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(createTipRequestSchema)) body: CreateTipRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffTip> {
    return this.svc.create({ userId: user.userId, requestId: ctx.requestId }, body);
  }

  @Post(":id/archive")
  @HttpCode(200)
  @RequirePermission("announcements:publish")
  @ApiOperation({ summary: "Archive a tip so it leaves the daily rotation" })
  @ApiErrors(400, 401, 403, 404)
  archive(
    @CurrentUser() user: AuthContext,
    @Param("id", new ZodPipe(z.uuid())) id: string,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffTip> {
    return this.svc.archive({ userId: user.userId, requestId: ctx.requestId }, id);
  }
}
