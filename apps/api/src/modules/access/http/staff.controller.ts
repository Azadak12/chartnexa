import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  assignRoleRequestSchema,
  AUDIT_OUTCOMES,
  lookupQuerySchema,
  revokeRoleRequestSchema,
  type AssignRoleRequest,
  type AuditEvent,
  type LookupQuery,
  type Page,
  type RevokeRoleRequest,
  type RoleChangeResponse,
  type UserLookupResponse,
} from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../../config/config.js";
import { pageParamsSchema } from "../../../pagination/cursor.js";
import { ApiErrors, ApiZodBody } from "../../../platform/openapi-helpers.js";
import { ZodPipe } from "../../../platform/zod.pipe.js";
import { CurrentUser, Ctx, type AuthContext, type RequestCtx } from "../../identity/index.js";
import { AuditService } from "../audit/audit.service.js";
import { RequirePermission } from "../authorization/require-permission.js";
import { RolesService } from "../roles/roles.service.js";

const auditQuerySchema = pageParamsSchema.extend({
  actorUserId: z.uuid().optional(),
  targetId: z.string().trim().min(1).max(64).optional(),
  action: z.string().trim().min(1).max(64).optional(),
  outcome: z.enum(AUDIT_OUTCOMES).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
type AuditQuery = z.infer<typeof auditQuerySchema>;

const paramId = () => new ZodPipe(z.uuid());
const userTarget = (req: { params: unknown }): string =>
  String((req.params as { id?: string }).id ?? "unknown").slice(0, 64);

@ApiTags("staff")
@Controller("staff")
export class StaffController {
  constructor(
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Get("users/lookup")
  @RequirePermission("users:read")
  @ApiOperation({ summary: "Find an account by exact email (id, display name, role, status only)" })
  @ApiErrors(400, 404)
  lookup(@Query(new ZodPipe(lookupQuerySchema)) q: LookupQuery): Promise<UserLookupResponse> {
    return this.roles.lookupByEmail(q.email);
  }

  @Put("users/:id/role")
  @HttpCode(200)
  @RequirePermission("roles:manage", {
    auditDenied: { action: "role.assign", targetType: "user", target: userTarget },
  })
  @ApiOperation({ summary: "Assign or replace a staff role (Admin only, reason required)" })
  @ApiZodBody(assignRoleRequestSchema)
  @ApiErrors(400, 404, 409)
  assign(
    @Param("id", paramId()) id: string,
    @Body(new ZodPipe(assignRoleRequestSchema)) body: AssignRoleRequest,
    @CurrentUser() user: AuthContext,
    @Ctx() ctx: RequestCtx,
  ): Promise<RoleChangeResponse> {
    return this.roles.assignRole(
      { userId: user.userId, requestId: ctx.requestId },
      id,
      body.role,
      body.reason,
    );
  }

  @Post("users/:id/role/revoke")
  @HttpCode(200)
  @RequirePermission("roles:manage", {
    auditDenied: { action: "role.revoke", targetType: "user", target: userTarget },
  })
  @ApiOperation({ summary: "Revoke a staff role (Admin only, reason required)" })
  @ApiZodBody(revokeRoleRequestSchema)
  @ApiErrors(400, 404, 409)
  revoke(
    @Param("id", paramId()) id: string,
    @Body(new ZodPipe(revokeRoleRequestSchema)) body: RevokeRoleRequest,
    @CurrentUser() user: AuthContext,
    @Ctx() ctx: RequestCtx,
  ): Promise<RoleChangeResponse> {
    return this.roles.revokeRole(
      { userId: user.userId, requestId: ctx.requestId },
      id,
      body.reason,
    );
  }

  @Get("audit-events")
  @RequirePermission("audit:read", {
    auditDenied: { action: "audit.read", targetType: "audit_events", target: () => "list" },
  })
  @ApiOperation({ summary: "List audit records, newest first (Admin only)" })
  @ApiErrors(400)
  events(@Query(new ZodPipe(auditQuerySchema)) q: AuditQuery): Promise<Page<AuditEvent>> {
    const { limit, cursor, ...filter } = q;
    return this.audit.list(filter, { limit, cursor }, this.config.CURSOR_SECRET);
  }
}
