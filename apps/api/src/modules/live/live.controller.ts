import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  cancelLiveSessionRequestSchema,
  createLiveSessionRequestSchema,
  updateLiveSessionRequestSchema,
  type CancelLiveSessionRequest,
  type CreateLiveSessionRequest,
  type LiveJoin,
  type LiveSessionList,
  type StaffLiveSession,
  type StaffLiveSessionList,
  type UpdateLiveSessionRequest,
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
import { LiveService } from "./live.service.js";

const idPipe = () => new ZodPipe(z.uuid());
const courseOf = (req: FastifyRequest) => ({
  courseId: (req.params as { courseId?: string }).courseId ?? "",
});

@ApiTags("staff")
@Controller("staff/courses/:courseId/live-sessions")
export class StaffLiveController {
  constructor(@Inject(LiveService) private readonly live: LiveService) {}

  @Get()
  @RequirePermission("live:schedule", { resource: courseOf })
  @ApiOperation({ summary: "A course's live classes, with links and join counts" })
  @ApiErrors(404)
  list(@Param("courseId", idPipe()) courseId: string): Promise<StaffLiveSessionList> {
    return this.live.listStaff(courseId);
  }

  @Post()
  @HttpCode(201)
  @RequirePermission("live:schedule", { resource: courseOf })
  @ApiOperation({ summary: "Schedule a live class (times with a time zone; link https only)" })
  @ApiZodBody(createLiveSessionRequestSchema)
  @ApiErrors(400, 404, 409)
  create(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Body(new ZodPipe(createLiveSessionRequestSchema)) body: CreateLiveSessionRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffLiveSession> {
    return this.live.create({ userId: user.userId, requestId: ctx.requestId }, courseId, body);
  }

  @Patch(":sessionId")
  @RequirePermission("live:schedule", { resource: courseOf })
  @ApiOperation({ summary: "Change or reschedule a live class that has not ended" })
  @ApiZodBody(updateLiveSessionRequestSchema)
  @ApiErrors(400, 404, 409)
  update(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("sessionId", idPipe()) sessionId: string,
    @Body(new ZodPipe(updateLiveSessionRequestSchema)) body: UpdateLiveSessionRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffLiveSession> {
    return this.live.update(
      { userId: user.userId, requestId: ctx.requestId },
      courseId,
      sessionId,
      body,
    );
  }

  @Post(":sessionId/cancel")
  @HttpCode(200)
  @RequirePermission("live:schedule", { resource: courseOf })
  @ApiOperation({ summary: "Cancel a live class with a reason students will see" })
  @ApiZodBody(cancelLiveSessionRequestSchema)
  @ApiErrors(400, 404, 409)
  cancel(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("sessionId", idPipe()) sessionId: string,
    @Body(new ZodPipe(cancelLiveSessionRequestSchema)) body: CancelLiveSessionRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffLiveSession> {
    return this.live.cancel(
      { userId: user.userId, requestId: ctx.requestId },
      courseId,
      sessionId,
      body,
    );
  }
}

@ApiTags("courses")
@Controller()
export class LiveController {
  constructor(@Inject(LiveService) private readonly live: LiveService) {}

  @Get("courses/:courseId/live-sessions")
  @Authenticated()
  @ApiOperation({ summary: "Live classes of a course you own (no join links)" })
  @ApiErrors(401, 403)
  list(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
  ): Promise<LiveSessionList> {
    return this.live.listForCourse(user.userId, courseId);
  }

  @Get("me/live-sessions")
  @Authenticated()
  @ApiOperation({ summary: "Upcoming live classes in all your courses, soonest first" })
  @ApiErrors(401)
  mine(@CurrentUser() user: AuthContext): Promise<LiveSessionList> {
    return this.live.listMine(user.userId);
  }

  @Post("me/courses/:courseId/live-sessions/:sessionId/join")
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({ summary: "Get the join link once the class opens" })
  @ApiErrors(401, 403, 404, 409)
  join(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("sessionId", idPipe()) sessionId: string,
  ): Promise<LiveJoin> {
    return this.live.join(user.userId, courseId, sessionId);
  }
}
