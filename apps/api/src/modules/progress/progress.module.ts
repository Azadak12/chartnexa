import { Inject, Module } from "@nestjs/common";
import { EntitlementsModule } from "../entitlements/index.js";
import { AccountDeletionHooks, IdentityModule } from "../identity/index.js";
import { ContinueLearningController, ProgressController } from "./progress.controller.js";
import { ProgressService } from "./progress.service.js";

@Module({
  imports: [IdentityModule, EntitlementsModule],
  controllers: [ProgressController, ContinueLearningController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {
  constructor(
    @Inject(AccountDeletionHooks) hooks: AccountDeletionHooks,
    @Inject(ProgressService) progress: ProgressService,
  ) {
    // A failing hook cancels the whole account deletion, so nothing is half deleted.
    hooks.register((tx, userId) => progress.deleteForAccount(tx, userId));
  }
}
