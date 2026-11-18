import { Module } from "@nestjs/common";
import { AccessModule } from "../access/index.js";
import { IdentityModule } from "../identity/index.js";
import { MyCoursesController, StaffEntitlementsController } from "./entitlements.controller.js";
import { EntitlementsService } from "./entitlements.service.js";

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [StaffEntitlementsController, MyCoursesController],
  providers: [EntitlementsService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
