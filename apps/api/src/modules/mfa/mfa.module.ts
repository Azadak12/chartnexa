import { Global, Inject, Module } from "@nestjs/common";
import { AccessModule } from "../access/index.js";
import { AccountDeletionHooks, IdentityModule, MFA_GATE } from "../identity/index.js";
import { RateLimitModule } from "../rate-limit/index.js";
import { MfaAuthController, MyMfaController, StaffMfaController } from "./mfa.controller.js";
import { MfaService } from "./mfa.service.js";

/**
 * Global so that sign-in (in the identity module) can find the second-step gate without
 * identity importing this module, which would make a cycle.
 */
@Global()
@Module({
  imports: [IdentityModule, AccessModule, RateLimitModule],
  controllers: [MfaAuthController, MyMfaController, StaffMfaController],
  providers: [MfaService, { provide: MFA_GATE, useExisting: MfaService }],
  exports: [MfaService, MFA_GATE],
})
export class MfaModule {
  constructor(
    @Inject(AccountDeletionHooks) hooks: AccountDeletionHooks,
    @Inject(MfaService) mfa: MfaService,
  ) {
    // A failing hook cancels the whole account deletion, so nothing is half deleted.
    hooks.register((tx, userId) => mfa.deleteForAccount(tx, userId));
  }
}
