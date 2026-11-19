import { Inject, Module } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { AccessModule } from "../access/index.js";
import { CoursesModule } from "../courses/index.js";
import { EntitlementsModule } from "../entitlements/index.js";
import { AccountDeletionHooks, IdentityModule } from "../identity/index.js";
import { LIVE_PROVIDER, ManualLinkProvider, type LiveProvider } from "./live-provider.js";
import { LiveController, StaffLiveController } from "./live.controller.js";
import { LiveService } from "./live.service.js";

@Module({
  imports: [IdentityModule, AccessModule, CoursesModule, EntitlementsModule],
  controllers: [StaffLiveController, LiveController],
  providers: [
    LiveService,
    {
      provide: LIVE_PROVIDER,
      useFactory: (c: AppConfig): LiveProvider => {
        switch (c.LIVE_PROVIDER) {
          case "manual":
            return new ManualLinkProvider();
        }
      },
      inject: [CONFIG],
    },
  ],
  exports: [LiveService],
})
export class LiveModule {
  constructor(
    @Inject(AccountDeletionHooks) hooks: AccountDeletionHooks,
    @Inject(LiveService) live: LiveService,
  ) {
    hooks.register((tx, userId) => live.deleteForAccount(tx, userId));
  }
}
