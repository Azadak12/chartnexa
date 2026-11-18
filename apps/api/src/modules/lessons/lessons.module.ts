import { Module } from "@nestjs/common";
import { AccessModule } from "../access/index.js";
import { CoursesModule } from "../courses/index.js";
import { EntitlementsModule } from "../entitlements/index.js";
import { IdentityModule } from "../identity/index.js";
import { PublicLessonsController, StaffLessonsController } from "./lessons.controller.js";
import { LessonsService } from "./lessons.service.js";

@Module({
  imports: [IdentityModule, AccessModule, CoursesModule, EntitlementsModule],
  controllers: [PublicLessonsController, StaffLessonsController],
  providers: [LessonsService],
  exports: [LessonsService],
})
export class LessonsModule {}
