import { Controller, Delete, Get, HttpCode, Inject, Param, Put } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type {
  CompletionResponse,
  ContinueLearning,
  ProgressResponse,
} from "@chartnexa/api-contracts";
import { ApiErrors } from "../../platform/openapi-helpers.js";
import { ZodPipe } from "../../platform/zod.pipe.js";
import { Authenticated, CurrentUser, type AuthContext } from "../identity/index.js";
import { ProgressService } from "./progress.service.js";

const idPipe = () => new ZodPipe(z.uuid());

/** Always the caller's own progress: the person comes from the token, never from the request. */
@ApiTags("me")
@Controller("me/courses/:courseId")
export class ProgressController {
  constructor(@Inject(ProgressService) private readonly progress: ProgressService) {}

  @Get("progress")
  @Authenticated()
  @ApiOperation({ summary: "Your progress in a course you have access to" })
  @ApiErrors(400, 401, 403)
  read(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
  ): Promise<ProgressResponse> {
    return this.progress.read(user.userId, courseId);
  }

  @Put("lessons/:lessonId/completion")
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({ summary: "Mark a lesson complete (repeating it changes nothing)" })
  @ApiErrors(400, 401, 403, 404)
  mark(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
  ): Promise<CompletionResponse> {
    return this.progress.mark(user.userId, courseId, lessonId);
  }

  @Delete("lessons/:lessonId/completion")
  @HttpCode(200)
  @Authenticated()
  @ApiOperation({ summary: "Mark a lesson not complete (repeating it changes nothing)" })
  @ApiErrors(400, 401, 403, 404)
  unmark(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
  ): Promise<CompletionResponse> {
    return this.progress.unmark(user.userId, courseId, lessonId);
  }
}

@ApiTags("me")
@Controller("me")
export class ContinueLearningController {
  constructor(@Inject(ProgressService) private readonly progress: ProgressService) {}

  @Get("continue-learning")
  @Authenticated()
  @ApiOperation({
    summary: "The unfinished course you were most recently studying, and its next lesson",
  })
  @ApiErrors(401)
  get(@CurrentUser() user: AuthContext): Promise<ContinueLearning> {
    return this.progress.continueLearning(user.userId);
  }
}
