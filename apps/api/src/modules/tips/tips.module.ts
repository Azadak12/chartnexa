import { Module } from "@nestjs/common";
import { AccessModule } from "../access/index.js";
import { IdentityModule } from "../identity/index.js";
import { MyTipController, StaffTipsController } from "./tips.controller.js";
import { TipsService } from "./tips.service.js";

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [MyTipController, StaffTipsController],
  providers: [TipsService],
  exports: [TipsService],
})
export class TipsModule {}
