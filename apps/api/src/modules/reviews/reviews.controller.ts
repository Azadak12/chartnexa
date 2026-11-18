import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  reviewPageQuerySchema,
  writeReviewRequestSchema,
  type MyReviewResponse,
  type Page,
  type Review,
  type ReviewPageQuery,
  type WriteReviewRequest,
} from "@chartnexa/api-contracts";
import { ApiErrors, ApiZodBody } from "../../platform/openapi-helpers.js";
import { ZodPipe } from "../../platform/zod.pipe.js";
import {
  Authenticated,
  CurrentUser,
  MaybeUser,
  OptionalAuthentication,
  type AuthContext,
} from "../identity/index.js";
import { ReviewsService } from "./reviews.service.js";

const idPipe = () => new ZodPipe(z.uuid());

@ApiTags("courses")
@Controller("courses/:courseId/reviews")
export class PublicReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}

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
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}

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
  @Authenticated()
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
