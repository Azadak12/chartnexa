import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  createCategoryRequestSchema,
  renameCategoryRequestSchema,
  type Category,
  type CreateCategoryRequest,
  type RenameCategoryRequest,
  type StaffCategory,
} from "@chartnexa/api-contracts";
import { ApiErrors, ApiZodBody } from "../../platform/openapi-helpers.js";
import { ZodPipe } from "../../platform/zod.pipe.js";
import { RequirePermission } from "../access/index.js";
import { Ctx, CurrentUser, type AuthContext, type RequestCtx } from "../identity/index.js";
import { CategoriesService } from "./categories.service.js";

const idPipe = () => new ZodPipe(z.uuid());
const target = (req: FastifyRequest): string =>
  String((req.params as { id?: string }).id ?? "new").slice(0, 64);

@ApiTags("courses")
@Controller("categories")
export class CategoriesController {
  constructor(@Inject(CategoriesService) private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: "Course categories in name order, with their published course counts" })
  list(): Promise<{ items: Category[] }> {
    return this.categories.listPublic();
  }
}

@ApiTags("staff")
@Controller("staff/categories")
export class StaffCategoriesController {
  constructor(@Inject(CategoriesService) private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermission("categories:manage")
  @ApiOperation({ summary: "Categories with all their courses counted (drafts included)" })
  list(): Promise<{ items: StaffCategory[] }> {
    return this.categories.listStaff();
  }

  @Post()
  @HttpCode(200)
  @RequirePermission("categories:manage", {
    auditDenied: { action: "category.create", targetType: "category", target },
  })
  @ApiOperation({ summary: "Add a category (names are unique ignoring case; at most 50)" })
  @ApiZodBody(createCategoryRequestSchema)
  @ApiErrors(400, 409)
  create(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(createCategoryRequestSchema)) body: CreateCategoryRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffCategory> {
    return this.categories.create({ userId: user.userId, requestId: ctx.requestId }, body);
  }

  @Patch(":id")
  @RequirePermission("categories:manage", {
    auditDenied: { action: "category.rename", targetType: "category", target },
  })
  @ApiOperation({ summary: "Rename a category (send the version you started from)" })
  @ApiZodBody(renameCategoryRequestSchema)
  @ApiErrors(400, 404, 409)
  rename(
    @CurrentUser() user: AuthContext,
    @Param("id", idPipe()) id: string,
    @Body(new ZodPipe(renameCategoryRequestSchema)) body: RenameCategoryRequest,
    @Ctx() ctx: RequestCtx,
  ): Promise<StaffCategory> {
    return this.categories.rename({ userId: user.userId, requestId: ctx.requestId }, id, body);
  }

  @Delete(":id")
  @RequirePermission("categories:manage", {
    auditDenied: { action: "category.delete", targetType: "category", target },
  })
  @ApiOperation({ summary: "Delete an unused category (repeating it still succeeds)" })
  @ApiErrors(400, 409)
  remove(
    @CurrentUser() user: AuthContext,
    @Param("id", idPipe()) id: string,
    @Ctx() ctx: RequestCtx,
  ): Promise<{ deleted: boolean }> {
    return this.categories.remove({ userId: user.userId, requestId: ctx.requestId }, id);
  }
}
