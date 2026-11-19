import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  startVideoUploadRequestSchema,
  videoProgressRequestSchema,
  type LessonVideo,
  type StaffVideo,
  type StartVideoUploadRequest,
  type UploadSession,
  type VideoProgress,
  type VideoProgressRequest,
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
import { VideoService } from "./video.service.js";

const idPipe = () => new ZodPipe(z.uuid());
const courseOf = (req: FastifyRequest) => ({
  courseId: (req.params as { courseId?: string }).courseId ?? "",
});

@ApiTags("staff")
@Controller("staff/courses/:courseId")
export class StaffVideoController {
  constructor(@Inject(VideoService) private readonly videos: VideoService) {}

  @Post("lessons/:lessonId/video/uploads")
  @HttpCode(200)
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({
    summary: "Start a video upload (MP4 up to 1 GB); send parts, then complete-video",
  })
  @ApiZodBody(startVideoUploadRequestSchema)
  @ApiErrors(400, 404)
  start(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
    @Body(new ZodPipe(startVideoUploadRequestSchema)) body: StartVideoUploadRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<UploadSession> {
    return this.videos.startUpload(
      { userId: user.userId, requestId: ctx.requestId },
      courseId,
      lessonId,
      body,
    );
  }

  @Post("uploads/:uploadId/complete-video")
  @HttpCode(200)
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({
    summary: "Make the uploaded MP4 the lesson's video (repeating it returns the same video)",
  })
  @ApiErrors(400, 404, 409)
  complete(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("uploadId", idPipe()) uploadId: string,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffVideo> {
    return this.videos.completeUpload(
      { userId: user.userId, requestId: ctx.requestId },
      courseId,
      uploadId,
    );
  }

  @Get("lessons/:lessonId/video")
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "The lesson's video and its processing status" })
  @ApiErrors(400, 404)
  get(
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
  ): Promise<{ video: StaffVideo | null }> {
    return this.videos.getStaff(courseId, lessonId);
  }

  @Delete("lessons/:lessonId/video")
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "Remove the lesson's video (repeating it still succeeds)" })
  @ApiErrors(400)
  remove(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
    @Ctx() ctx: RequestCtx,
  ): Promise<{ deleted: boolean }> {
    return this.videos.remove(
      { userId: user.userId, requestId: ctx.requestId },
      courseId,
      lessonId,
    );
  }
}

@ApiTags("courses")
@Controller()
export class PublicVideoController {
  constructor(@Inject(VideoService) private readonly videos: VideoService) {}

  @Get("courses/:courseId/lessons/:lessonId/video")
  @OptionalAuthentication()
  @ApiOperation({
    summary:
      "The lesson's ready video with a playback link, and your progress if you own the course",
  })
  @ApiErrors(400, 403, 404)
  get(
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
    @MaybeUser() viewer: AuthContext | undefined,
  ): Promise<{ video: LessonVideo | null }> {
    return this.videos.getForViewer(courseId, lessonId, viewer?.userId);
  }

  @Put("me/courses/:courseId/lessons/:lessonId/video-progress")
  @Authenticated()
  @ApiOperation({
    summary: "Report watching; the lesson completes once enough of the video is watched",
  })
  @ApiZodBody(videoProgressRequestSchema)
  @ApiErrors(400, 401, 403, 404)
  progress(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
    @Body(new ZodPipe(videoProgressRequestSchema)) body: VideoProgressRequest,
  ): Promise<VideoProgress> {
    return this.videos.heartbeat(user.userId, courseId, lessonId, body);
  }

  /** Test adapter's playback: the MP4 with HTTP ranges. The signed link is the permission. */
  @Get("videos/:videoId/stream")
  @ApiOperation({ summary: "Video bytes for a playback link (test video adapter only)" })
  @ApiErrors(404)
  async stream(
    @Param("videoId", idPipe()) videoId: string,
    @Query("t") token: string | undefined,
    @Headers("range") range: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const out = token ? await this.videos.stream(videoId, token, range) : null;
    if (!out) throw new NotFoundException("This playback link is invalid or has expired.");
    if (out === "unsatisfiable") {
      throw new HttpException(
        { message: "Range not satisfiable.", code: "RANGE_NOT_SATISFIABLE" },
        416,
      );
    }
    void reply
      .status(out.partial ? 206 : 200)
      .header("content-type", "video/mp4")
      .header("accept-ranges", "bytes")
      .header("content-length", String(out.end - out.start + 1))
      .header("cache-control", "private, no-store")
      .header("x-content-type-options", "nosniff");
    if (out.partial)
      void reply.header("content-range", `bytes ${out.start}-${out.end}/${out.size}`);
    return new StreamableFile(out.stream);
  }
}
