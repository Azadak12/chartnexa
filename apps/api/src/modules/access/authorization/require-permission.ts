import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
  applyDecorators,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiBearerAuth } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { ApiErrors } from "../../../platform/openapi-helpers.js";
import { AuthGuard, logEvent, type AuthedRequest } from "../../identity/index.js";
import { AuditService } from "../audit/audit.service.js";
import { AuthorizationService, FORBIDDEN_MESSAGE, type Resource } from "./authorization.service.js";
import type { Permission } from "./permissions.js";

const KEY = "access:requirement";

export interface RequirementOptions {
  /** Derive the resource (for example a course id) from the request. */
  resource?: (req: FastifyRequest) => Resource | undefined;
  /** For endpoints with no single course (a list): holding the permission for any course passes. */
  anyCourse?: boolean;
  /** When set, a denial is written to the audit trail under this action. */
  auditDenied?: { action: string; targetType: string; target: (req: FastifyRequest) => string };
}

interface Requirement extends RequirementOptions {
  permission: Permission;
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async canActivate(host: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.get<Requirement | undefined>(KEY, host.getHandler());
    if (!requirement) throw new Error("PermissionGuard used without @RequirePermission");
    const req = host.switchToHttp().getRequest<AuthedRequest>();
    const auth = req.auth;
    if (!auth) throw new Error("PermissionGuard ran before authentication");

    const access = await this.authz.accessForRequest(req, auth.userId);
    const resource = requirement.resource?.(req);
    if (
      this.authz.decide(access, requirement.permission, resource, {
        anyCourse: requirement.anyCourse === true,
      })
    )
      return true;

    logEvent({ log: req.log }, "authz.denied", {
      userId: auth.userId,
      outcome: requirement.permission,
    });
    if (requirement.auditDenied) {
      const a = requirement.auditDenied;
      await this.audit.recordDenied({
        actorKind: "user",
        actorUserId: auth.userId,
        action: a.action,
        targetType: a.targetType,
        targetId: a.target(req),
        reason: "missing_permission",
        after: { permission: requirement.permission },
        requestId: req.id,
      });
    }
    throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }
}

/** Requires a valid sign-in and the given permission, checked on the server on every request. */
export const RequirePermission = (permission: Permission, options: RequirementOptions = {}) =>
  applyDecorators(
    SetMetadata(KEY, { permission, ...options } satisfies Requirement),
    UseGuards(AuthGuard, PermissionGuard),
    ApiBearerAuth(),
    ApiErrors(401, 403),
  );
