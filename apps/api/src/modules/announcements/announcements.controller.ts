import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  announcementPageQuerySchema,
  createAnnouncementRequestSchema,
  withdrawAnnouncementRequestSchema,
  type Announcement,
  type AnnouncementPageQuery,
  type CreateAnnouncementRequest,
  type Page,
  type StaffAnnouncement,
  type WithdrawAnnouncementRequest,
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
import { AnnouncementsService } from "./announcements.service.js";

const idPipe = () => new ZodPipe(z.uuid());

@ApiTags("staff")
@Controller("staff/announcements")
export class StaffAnnouncementsController {
  constructor(@Inject(AnnouncementsService) private readonly svc: AnnouncementsService) {}

  @Get()
  @RequirePermission("announcements:publish")
  @ApiOperation({ summary: "Every announcement, newest first, with read counts" })
  @ApiErrors(400)
  list(
    @Query(new ZodPipe(announcementPageQuerySchema)) q: AnnouncementPageQuery,
  ): Promise<Page<StaffAnnouncement>> {
    return this.svc.listStaff(q);
  }

  @Post()
  @HttpCode(200)
  @RequirePermission("announcements:publish")
  @ApiOperation({ summary: "Publish a plain-text announcement to everyone or one course's owners" })
  @ApiZodBody(createAnnouncementRequestSchema)
  @ApiErrors(400, 404, 409)
  publish(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(createAnnouncementRequestSchema)) body: CreateAnnouncementRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffAnnouncement> {
    return this.svc.publish({ userId: user.userId, requestId: ctx.requestId }, body);
  }

  @Post(":id/withdraw")
  @HttpCode(200)
  @RequirePermission("announcements:publish")
  @ApiOperation({ summary: "Withdraw an announcement; readers no longer see it" })
  @ApiZodBody(withdrawAnnouncementRequestSchema)
  @ApiErrors(400, 404)
  withdraw(
    @CurrentUser() user: AuthContext,
    @Param("id", idPipe()) id: string,
    @Body(new ZodPipe(withdrawAnnouncementRequestSchema)) body: WithdrawAnnouncementRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffAnnouncement> {
    return this.svc.withdraw({ userId: user.userId, requestId: ctx.requestId }, id, body);
  }
}

@ApiTags("me")
@Controller("me/announcements")
export class MyAnnouncementsController {
  constructor(@Inject(AnnouncementsService) private readonly svc: AnnouncementsService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: "Announcements for you, newest first, with read state" })
  @ApiErrors(400, 401)
  list(
    @CurrentUser() user: AuthContext,
    @Query(new ZodPipe(announcementPageQuerySchema)) q: AnnouncementPageQuery,
  ): Promise<Page<Announcement>> {
    return this.svc.listMine(user.userId, q);
  }

  @Get("unread-count")
  @Authenticated()
  @ApiOperation({ summary: "How many announcements you have not read" })
  @ApiErrors(401)
  unread(@CurrentUser() user: AuthContext): Promise<{ unread: number }> {
    return this.svc.unreadCount(user.userId);
  }

  @Put(":id/read")
  @Authenticated()
  @ApiOperation({ summary: "Mark an announcement read (repeating it changes nothing)" })
  @ApiErrors(401, 404)
  read(
    @CurrentUser() user: AuthContext,
    @Param("id", idPipe()) id: string,
  ): Promise<{ read: true }> {
    return this.svc.markRead(user.userId, id);
  }
}
