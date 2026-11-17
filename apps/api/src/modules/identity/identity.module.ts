import { Module } from "@nestjs/common";
import { AccountDeletionHooks } from "./accounts/deletion-hooks.js";
import { AccountsService } from "./accounts/accounts.service.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { AuthController } from "./http/auth.controller.js";
import { MeController } from "./http/me.controller.js";
import { PasswordService } from "./password/password.service.js";
import { SessionsService } from "./sessions/sessions.service.js";
import { AccessTokenService } from "./tokens/access-token.service.js";

@Module({
  controllers: [AuthController, MeController],
  providers: [
    AccessTokenService,
    PasswordService,
    SessionsService,
    AccountsService,
    AuthService,
    AuthGuard,
    AccountDeletionHooks,
  ],
  exports: [AuthGuard, AccessTokenService, AccountDeletionHooks],
})
export class IdentityModule {}
