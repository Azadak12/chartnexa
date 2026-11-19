import { Inject, Module } from "@nestjs/common";
import { AccessModule } from "../access/index.js";
import { AccountDeletionHooks, IdentityModule } from "../identity/index.js";
import {
  MyAnnouncementsController,
  StaffAnnouncementsController,
} from "./announcements.controller.js";
import { AnnouncementsService } from "./announcements.service.js";

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [StaffAnnouncementsController, MyAnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {
  constructor(
    @Inject(AccountDeletionHooks) hooks: AccountDeletionHooks,
    @Inject(AnnouncementsService) svc: AnnouncementsService,
  ) {
    hooks.register((tx, userId) => svc.deleteForAccount(tx, userId));
  }
}
