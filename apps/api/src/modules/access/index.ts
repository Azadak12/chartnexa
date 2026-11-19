// Public surface of the access module. Other modules import only from here.
export { AccessModule } from "./access.module.js";
export { RequirePermission } from "./authorization/require-permission.js";
export {
  AuthorizationService,
  type Access,
  type Resource,
} from "./authorization/authorization.service.js";
export { AuditService, type AuditInput } from "./audit/audit.service.js";
export { GrantsService } from "./grants/grants.service.js";
export { RolesService } from "./roles/roles.service.js";
export {
  ALL_PERMISSIONS,
  permissionsForRole,
  type Permission,
  type Role,
  type StaffRole,
} from "./authorization/permissions.js";
