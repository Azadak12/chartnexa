// Public surface of the identity module. Other modules import only from here.
export { IdentityModule } from "./identity.module.js";
export {
  Authenticated,
  AuthGuard,
  OptionalAuthentication,
  OptionalAuthGuard,
} from "./auth.guard.js";
export {
  Ctx,
  CurrentUser,
  logEvent,
  MaybeUser,
  type AuthContext,
  type AuthedRequest,
  type RequestCtx,
} from "./http/request-context.js";
export { AccountDeletionHooks, type DeletionHook } from "./accounts/deletion-hooks.js";
export { MFA_GATE, type MfaGate } from "./mfa-gate.js";
export { PasswordService } from "./password/password.service.js";
export { SessionsService } from "./sessions/sessions.service.js";
export { hashToken, newOpaqueToken } from "./tokens/token-util.js";
