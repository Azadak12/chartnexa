// Public surface of the identity module. Other modules import only from here.
export { IdentityModule } from "./identity.module.js";
export { Authenticated, AuthGuard } from "./auth.guard.js";
export { CurrentUser, type AuthContext } from "./http/request-context.js";
