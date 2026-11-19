import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  appealReviewRequestSchema,
  decideAppealRequestSchema,
  hideReviewRequestSchema,
  reportReviewRequestSchema,
  restoreReviewRequestSchema,
  reviewPageQuerySchema,
  staffReviewQuerySchema,
  writeReviewRequestSchema,
  type AppealReviewRequest,
  type DecideAppealRequest,
  type HideReviewRequest,
  type MyReviewResponse,
  type Page,
  type ReportReviewRequest,
  type ReportReviewResponse,
  type RestoreReviewRequest,
  type Review,
  type ReviewPageQuery,
  type StaffReview,
  type StaffReviewActionResponse,
  type StaffReviewDetail,
  type StaffReviewQuery,
  type WriteReviewRequest,
} from "@chartnexa/api-contracts";
import { ApiErrors, ApiZodBody } from "../../platform/openapi-helpers.js";
import { ZodPipe } from "../../platform/zod.pipe.js";
import { RequirePermission } from "../access/index.js";
import {
  Authenticated,
  Ctx,
  CurrentUser,
  MaybeUser,
  OptionalAuthentication,
  type AuthContext,
  type RequestCtx,
} from "../identity/index.js";
import { ModerationService } from "./moderation.service.js";
import { ReviewsService } from "./reviews.service.js";

const idPipe = () => new ZodPipe(z.uuid());

@ApiTags("courses")
@Controller("courses/:courseId/reviews")
export class PublicReviewsController {
  constructor(
    @Inject(ReviewsService) private readonly reviews: ReviewsService,
    @Inject(ModerationService) private readonly moderation: ModerationService,
  ) {}

  @Post(":reviewId/report")
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({
    summary: "Report a review (one open report per person; reporting never hides anything)",
  })
  @ApiZodBody(reportReviewRequestSchema)
  @ApiErrors(400, 401, 403, 404, 429)
  report(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("reviewId", idPipe()) reviewId: string,
    @Body(new ZodPipe(reportReviewRequestSchema)) body: ReportReviewRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<ReportReviewResponse> {
    return this.moderation.report(
      { userId: user.userId, requestId: ctx.requestId },
      courseId,
      reviewId,
      body,
    );
  }

  @Get()
  @OptionalAuthentication()
  @ApiOperation({
    summary:
      "Reviews of a published course (anyone), newest first. Owners can still read an unpublished course's reviews.",
  })
  @ApiErrors(400, 404)
  list(
    @Param("courseId", idPipe()) courseId: string,
    @Query(new ZodPipe(reviewPageQuerySchema)) q: ReviewPageQuery,
    @MaybeUser() viewer: AuthContext | undefined,
  ): Promise<Page<Review>> {
    return this.reviews.list(courseId, viewer?.userId, q);
  }
}

/** Always the caller's own review: the author comes from the token, never from the request. */
@ApiTags("me")
@Controller("me/courses/:courseId/review")
export class MyReviewController {
  constructor(
    @Inject(ReviewsService) private readonly reviews: ReviewsService,
    @Inject(ModerationService) private readonly moderation: ModerationService,
  ) {}

  @Post("appeal")
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({ summary: "Appeal the hiding of your review (once per hiding)" })
  @ApiZodBody(appealReviewRequestSchema)
  @ApiErrors(400, 401, 403, 404, 409)
  appeal(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Body(new ZodPipe(appealReviewRequestSchema)) body: AppealReviewRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<MyReviewResponse> {
    return this.moderation.appeal(
      { userId: user.userId, requestId: ctx.requestId },
      courseId,
      body,
    );
  }

  @Get()
  @Authenticated()
  @ApiOperation({ summary: "Your review of a course you have access to, or null" })
  @ApiErrors(400, 401, 403)
  get(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
  ): Promise<MyReviewResponse> {
    return this.reviews.getMine(user.userId, courseId);
  }

  @Put()
  @HttpCode(200)
  @RequirePermission("reviews:write")
  @ApiOperation({ summary: "Write or replace your review (one per course; repeating it is safe)" })
  @ApiZodBody(writeReviewRequestSchema)
  @ApiErrors(400, 401, 403, 429)
  write(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Body(new ZodPipe(writeReviewRequestSchema)) body: WriteReviewRequest,
  ): Promise<Review> {
    return this.reviews.write(user.userId, courseId, body);
  }

  @Delete()
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({ summary: "Delete your review (repeating it still succeeds)" })
  @ApiErrors(400, 401, 403, 429)
  remove(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
  ): Promise<{ deleted: boolean }> {
    return this.reviews.remove(user.userId, courseId);
  }
}

const reviewTarget = (req: FastifyRequest): string =>
  String((req.params as { reviewId?: string }).reviewId ?? "unknown").slice(0, 64);

/** Moderators only. The permission is checked on the server for every route. */
@ApiTags("staff")
@Controller("staff")
export class StaffReviewsController {
  constructor(@Inject(ModerationService) private readonly moderation: ModerationService) {}

  @Get("reviews")
  @RequirePermission("reviews:moderate")
  @ApiOperation({
    summary: "Reviews to look at: reported, hidden or appealed, newest activity first",
  })
  @ApiErrors(400)
  queue(
    @Query(new ZodPipe(staffReviewQuerySchema)) q: StaffReviewQuery,
  ): Promise<Page<StaffReview>> {
    return this.moderation.queue(q);
  }

  @Get("reviews/:reviewId")
  @RequirePermission("reviews:moderate")
  @ApiOperation({ summary: "One review with its reports and appeals" })
  @ApiErrors(400, 404)
  detail(
    @CurrentUser() user: AuthContext,
    @Param("reviewId", idPipe()) reviewId: string,
  ): Promise<StaffReviewDetail> {
    return this.moderation.detail(reviewId, user.userId);
  }

  @Post("reviews/:reviewId/hide")
  @HttpCode(200)
  @RequirePermission("reviews:moderate", {
    auditDenied: { action: "review.hide", targetType: "review", target: reviewTarget },
  })
  @ApiOperation({ summary: "Hide a review (reason required; repeating it changes nothing)" })
  @ApiZodBody(hideReviewRequestSchema)
  @ApiErrors(400, 404)
  hide(
    @CurrentUser() user: AuthContext,
    @Param("reviewId", idPipe()) reviewId: string,
    @Body(new ZodPipe(hideReviewRequestSchema)) body: HideReviewRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffReviewActionResponse> {
    return this.moderation.hide({ userId: user.userId, requestId: ctx.requestId }, reviewId, body);
  }

  @Post("reviews/:reviewId/restore")
  @HttpCode(200)
  @RequirePermission("reviews:moderate", {
    auditDenied: { action: "review.restore", targetType: "review", target: reviewTarget },
  })
  @ApiOperation({ summary: "Restore a hidden review (repeating it changes nothing)" })
  @ApiZodBody(restoreReviewRequestSchema)
  @ApiErrors(400, 404)
  restore(
    @CurrentUser() user: AuthContext,
    @Param("reviewId", idPipe()) reviewId: string,
    @Body(new ZodPipe(restoreReviewRequestSchema)) body: RestoreReviewRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffReviewActionResponse> {
    return this.moderation.restore(
      { userId: user.userId, requestId: ctx.requestId },
      reviewId,
      body,
    );
  }

  @Post("review-appeals/:appealId/decide")
  @HttpCode(200)
  @RequirePermission("reviews:moderate")
  @ApiOperation({ summary: "Uphold or overturn an appeal (not the moderator who hid the review)" })
  @ApiZodBody(decideAppealRequestSchema)
  @ApiErrors(400, 403, 404, 409)
  decide(
    @CurrentUser() user: AuthContext,
    @Param("appealId", idPipe()) appealId: string,
    @Body(new ZodPipe(decideAppealRequestSchema)) body: DecideAppealRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffReviewActionResponse> {
    return this.moderation.decide(
      { userId: user.userId, requestId: ctx.requestId },
      appealId,
      body,
    );
  }
}
