import { Module, type OnModuleInit } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { AccountDeletionHooks, IdentityModule, type RequestCtx } from "../identity/index.js";
import { AuditService } from "./audit/audit.service.js";
import { AuthorizationService } from "./authorization/authorization.service.js";
import { PermissionGuard } from "./authorization/require-permission.js";
import { GrantsController } from "./http/grants.controller.js";
import { GrantsService } from "./grants/grants.service.js";
import { MeAccessController } from "./http/me-access.controller.js";
import { StaffController } from "./http/staff.controller.js";
import { RolesService } from "./roles/roles.service.js";

@Module({
  imports: [IdentityModule],
  controllers: [StaffController, GrantsController, MeAccessController],
  providers: [AuditService, AuthorizationService, RolesService, GrantsService, PermissionGuard],
  exports: [AuthorizationService, AuditService, RolesService, GrantsService, PermissionGuard],
})
export class AccessModule implements OnModuleInit {
  constructor(
    @Inject(AccountDeletionHooks) private readonly hooks: AccountDeletionHooks,
    @Inject(RolesService) private readonly roles: RolesService,
  ) {}

  onModuleInit(): void {
    this.hooks.register((tx, userId, ctx: RequestCtx) =>
      this.roles.endRoleForDeletion(tx, userId, ctx.requestId),
    );
  }
}
