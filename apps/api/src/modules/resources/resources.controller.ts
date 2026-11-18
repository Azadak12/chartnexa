import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
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
  completeUploadRequestSchema,
  fileLinkRequestSchema,
  startUploadRequestSchema,
  updateResourceRequestSchema,
  type CompleteUploadRequest,
  type FileLink,
  type PublicResource,
  type StaffResource,
  type StartUploadRequest,
  type UpdateResourceRequest,
  type UploadSession,
} from "@chartnexa/api-contracts";
import { ApiErrors, ApiZodBody } from "../../platform/openapi-helpers.js";
import { ZodPipe } from "../../platform/zod.pipe.js";
import { RequirePermission } from "../access/index.js";
import {
  Ctx,
  CurrentUser,
  MaybeUser,
  OptionalAuthentication,
  type AuthContext,
  type RequestCtx,
} from "../identity/index.js";
import { ResourcesService } from "./resources.service.js";

const idPipe = () => new ZodPipe(z.uuid());
const courseOf = (req: FastifyRequest) => ({
  courseId: (req.params as { courseId?: string }).courseId ?? "",
});
const actor = (u: AuthContext, ctx: RequestCtx) => ({ userId: u.userId, requestId: ctx.requestId });

/** Files are lesson content: the same permission as authoring the course's lessons. */
@ApiTags("staff")
@Controller("staff/courses/:courseId")
export class StaffResourcesController {
  constructor(@Inject(ResourcesService) private readonly resources: ResourcesService) {}

  @Post("lessons/:lessonId/uploads")
  @HttpCode(200)
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "Start an upload; send the parts, then complete it" })
  @ApiZodBody(startUploadRequestSchema)
  @ApiErrors(400, 404, 409)
  start(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
    @Body(new ZodPipe(startUploadRequestSchema)) body: StartUploadRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<UploadSession> {
    return this.resources.start(actor(user, ctx), courseId, lessonId, body);
  }

  @Put("uploads/:uploadId/parts/:part")
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({
    summary: "Send one part as application/octet-stream (exact size; resending replaces it)",
  })
  @ApiErrors(400, 404, 409)
  part(
    @Param("courseId", idPipe()) courseId: string,
    @Param("uploadId", idPipe()) uploadId: string,
    @Param("part", ParseIntPipe) part: number,
    @Body() body: unknown,
  ): Promise<{ received: number }> {
    return this.resources.putPart(courseId, uploadId, part, body);
  }

  @Post("uploads/:uploadId/complete")
  @HttpCode(200)
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "Check, scan and save the file (repeating it returns the same file)" })
  @ApiZodBody(completeUploadRequestSchema)
  @ApiErrors(400, 404, 409)
  complete(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("uploadId", idPipe()) uploadId: string,
    @Body(new ZodPipe(completeUploadRequestSchema)) body: CompleteUploadRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffResource> {
    return this.resources.complete(actor(user, ctx), courseId, uploadId, body);
  }

  @Delete("uploads/:uploadId")
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "Cancel an upload and remove its parts (repeating it succeeds)" })
  @ApiErrors(400)
  cancel(
    @Param("courseId", idPipe()) courseId: string,
    @Param("uploadId", idPipe()) uploadId: string,
  ): Promise<{ cancelled: boolean }> {
    return this.resources.cancel(courseId, uploadId);
  }

  @Get("lessons/:lessonId/resources")
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "A lesson's files with their scan status" })
  @ApiErrors(400, 404)
  list(
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
  ): Promise<{ items: StaffResource[] }> {
    return this.resources.listStaff(courseId, lessonId);
  }

  @Patch("lessons/:lessonId/resources/:resourceId")
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "Rename a file or change whether students may download it" })
  @ApiZodBody(updateResourceRequestSchema)
  @ApiErrors(400, 404, 409)
  update(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
    @Param("resourceId", idPipe()) resourceId: string,
    @Body(new ZodPipe(updateResourceRequestSchema)) body: UpdateResourceRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffResource> {
    return this.resources.update(actor(user, ctx), courseId, lessonId, resourceId, body);
  }

  @Delete("lessons/:lessonId/resources/:resourceId")
  @RequirePermission("lesson:upload", { resource: courseOf })
  @ApiOperation({ summary: "Delete a file (repeating it still succeeds)" })
  @ApiErrors(400)
  remove(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
    @Param("resourceId", idPipe()) resourceId: string,
    @Ctx() ctx: RequestCtx,
  ): Promise<{ deleted: boolean }> {
    return this.resources.remove(actor(user, ctx), courseId, lessonId, resourceId);
  }
}

@ApiTags("courses")
@Controller("courses/:courseId/lessons/:lessonId/resources")
export class PublicResourcesController {
  constructor(@Inject(ResourcesService) private readonly resources: ResourcesService) {}

  @Get()
  @OptionalAuthentication()
  @ApiOperation({ summary: "Files of a lesson you may read (free preview or owned course)" })
  @ApiErrors(400, 403, 404)
  list(
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
    @MaybeUser() viewer: AuthContext | undefined,
  ): Promise<{ items: PublicResource[] }> {
    return this.resources.listPublic(courseId, lessonId, viewer?.userId);
  }

  @Post(":resourceId/link")
  @HttpCode(200)
  @OptionalAuthentication()
  @ApiOperation({ summary: "A link to view (or, if allowed, download) a file; valid for minutes" })
  @ApiZodBody(fileLinkRequestSchema)
  @ApiErrors(400, 403, 404)
  link(
    @Param("courseId", idPipe()) courseId: string,
    @Param("lessonId", idPipe()) lessonId: string,
    @Param("resourceId", idPipe()) resourceId: string,
    @Body(new ZodPipe(fileLinkRequestSchema)) body: { download?: boolean },
    @MaybeUser() viewer: AuthContext | undefined,
  ): Promise<FileLink> {
    return this.resources.link(
      courseId,
      lessonId,
      resourceId,
      viewer?.userId,
      body.download ?? false,
    );
  }
}

/** Sends file bytes for a valid signed link. The link is the permission; it expires in minutes. */
@ApiTags("courses")
@Controller("files")
export class FilesController {
  constructor(@Inject(ResourcesService) private readonly resources: ResourcesService) {}

  @Get(":resourceId")
  @ApiOperation({ summary: "File bytes for a signed link (from the link endpoint)" })
  @ApiErrors(404)
  async read(
    @Param("resourceId", idPipe()) resourceId: string,
    @Query("t") token: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const file = token ? await this.resources.open(resourceId, token) : null;
    if (!file) throw new NotFoundException("This link is invalid or has expired.");
    const name = encodeURIComponent(file.fileName);
    void reply
      .header("content-type", file.mimeType)
      .header("content-length", String(file.size))
      .header(
        "content-disposition",
        `${file.download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      )
      .header("cache-control", "private, no-store")
      .header("x-content-type-options", "nosniff")
      .header("content-security-policy", "default-src 'none'; sandbox");
    return new StreamableFile(file.stream);
  }
}
