import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Put,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiErrors } from "../../platform/openapi-helpers.js";
import { ZodPipe } from "../../platform/zod.pipe.js";
import { RequirePermission } from "../access/index.js";
import { Ctx, CurrentUser, type AuthContext, type RequestCtx } from "../identity/index.js";
import { ThumbnailsService } from "./thumbnails.service.js";

const idPipe = () => new ZodPipe(z.uuid());
const courseOf = (req: FastifyRequest) => ({
  courseId: (req.params as { courseId?: string }).courseId ?? "",
});

@ApiTags("staff")
@Controller("staff/courses/:courseId/thumbnail")
export class StaffThumbnailController {
  constructor(@Inject(ThumbnailsService) private readonly thumbs: ThumbnailsService) {}

  @Put()
  @RequirePermission("course:update", { resource: courseOf })
  @ApiOperation({
    summary: "Set the course thumbnail (PNG, JPEG or WebP up to 2 MB, as raw bytes)",
  })
  @ApiErrors(400, 404)
  set(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestCtx,
  ): Promise<{ thumbnailUrl: string }> {
    return this.thumbs.set({ userId: user.userId, requestId: ctx.requestId }, courseId, body);
  }

  @Delete()
  @HttpCode(204)
  @RequirePermission("course:update", { resource: courseOf })
  @ApiOperation({ summary: "Remove the thumbnail (repeating it changes nothing)" })
  @ApiErrors(404)
  async remove(
    @CurrentUser() user: AuthContext,
    @Param("courseId", idPipe()) courseId: string,
    @Ctx() ctx: RequestCtx,
  ): Promise<void> {
    await this.thumbs.remove({ userId: user.userId, requestId: ctx.requestId }, courseId);
  }
}

@ApiTags("courses")
@Controller("courses/thumbnails")
export class PublicThumbnailController {
  constructor(@Inject(ThumbnailsService) private readonly thumbs: ThumbnailsService) {}

  @Get(":id")
  @ApiOperation({ summary: "A course thumbnail image (the id changes whenever the image does)" })
  @ApiErrors(404)
  async read(
    @Param("id", idPipe()) id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const file = await this.thumbs.open(id);
    if (!file) throw new NotFoundException("Image not found.");
    void reply
      .header("content-type", file.mime)
      .header("content-length", String(file.size))
      // The address changes with the image, so it can be cached for a long time.
      .header("cache-control", "public, max-age=31536000, immutable")
      .header("x-content-type-options", "nosniff")
      .header("content-security-policy", "default-src 'none'; sandbox");
    return new StreamableFile(file.stream);
  }
}
