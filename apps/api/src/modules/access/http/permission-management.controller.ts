import { Body, Controller, Get, HttpCode, Inject, Param, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  managedRoleSchema,
  permissionUsersQuerySchema,
  saveRoleDefaultsRequestSchema,
  savePermissionsRequestSchema,
  type ManagedRole,
  type PermissionUserDetail,
  type PermissionUsersPage,
  type PermissionUsersQuery,
  type RoleDefaultsResponse,
  type SavePermissionsRequest,
  type SaveRoleDefaultsRequest,
} from "@chartnexa/api-contracts";
import { ApiErrors, ApiZodBody } from "../../../platform/openapi-helpers.js";
import { ZodPipe } from "../../../platform/zod.pipe.js";
import { CurrentUser, Ctx, type AuthContext, type RequestCtx } from "../../identity/index.js";
import { RequirePermission } from "../authorization/require-permission.js";
import { PermissionManagementService } from "../permission-management/permission-management.service.js";

const paramId = () => new ZodPipe(z.uuid());
const userTarget = (req: { params: unknown }): string =>
  String((req.params as { id?: string }).id ?? "unknown").slice(0, 64);
const roleTarget = (req: { params: unknown }): string =>
  String((req.params as { role?: string }).role ?? "unknown").slice(0, 32);

/**
 * Admin Permission Management. Every route requires roles:manage, which only Admins hold and
 * which cannot be granted individually, so Managers, Instructors and Students get 403.
 */
@ApiTags("staff")
@Controller("staff/permissions")
export class PermissionManagementController {
  constructor(
    @Inject(PermissionManagementService) private readonly pm: PermissionManagementService,
  ) {}

  @Get("users")
  @RequirePermission("roles:manage")
  @ApiOperation({ summary: "Search Instructors, Managers or Students (Admin only)" })
  @ApiErrors(400)
  users(
    @Query(new ZodPipe(permissionUsersQuerySchema)) q: PermissionUsersQuery,
  ): Promise<PermissionUsersPage> {
    return this.pm.users(q);
  }

  @Get("users/:id")
  @RequirePermission("roles:manage", {
    auditDenied: { action: "permission.read", targetType: "user", target: userTarget },
  })
  @ApiOperation({ summary: "One person's permissions, with where each one comes from" })
  @ApiErrors(400, 404)
  detail(@Param("id", paramId()) id: string): Promise<PermissionUserDetail> {
    return this.pm.detail(id);
  }

  @Put("users/:id")
  @HttpCode(200)
  @RequirePermission("roles:manage", {
    auditDenied: { action: "permission.change", targetType: "user", target: userTarget },
  })
  @ApiOperation({
    summary: "Save a person's permission changes together (reason required, all or nothing)",
  })
  @ApiZodBody(savePermissionsRequestSchema)
  @ApiErrors(400, 404, 409)
  save(
    @Param("id", paramId()) id: string,
    @Body(new ZodPipe(savePermissionsRequestSchema)) body: SavePermissionsRequest,
    @CurrentUser() user: AuthContext,
    @Ctx() ctx: RequestCtx,
  ): Promise<PermissionUserDetail> {
    return this.pm.save({ userId: user.userId, requestId: ctx.requestId }, id, body);
  }

  @Get("roles")
  @RequirePermission("roles:manage")
  @ApiOperation({ summary: "What each role holds by default, and what the Admin changed" })
  roles(): Promise<RoleDefaultsResponse> {
    return this.pm.roleDefaults();
  }

  @Put("roles/:role")
  @HttpCode(200)
  @RequirePermission("roles:manage", {
    auditDenied: { action: "role.defaults.update", targetType: "role", target: roleTarget },
  })
  @ApiOperation({ summary: "Change a role's default permissions (reason required)" })
  @ApiZodBody(saveRoleDefaultsRequestSchema)
  @ApiErrors(400)
  saveRole(
    @Param("role", new ZodPipe(managedRoleSchema)) role: ManagedRole,
    @Body(new ZodPipe(saveRoleDefaultsRequestSchema)) body: SaveRoleDefaultsRequest,
    @CurrentUser() user: AuthContext,
    @Ctx() ctx: RequestCtx,
  ): Promise<RoleDefaultsResponse> {
    return this.pm.saveRoleDefaults({ userId: user.userId, requestId: ctx.requestId }, role, body);
  }
}
