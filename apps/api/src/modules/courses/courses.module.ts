import { Module } from "@nestjs/common";
import { AccessModule } from "../access/index.js";
import { EntitlementsModule } from "../entitlements/index.js";
import { IdentityModule } from "../identity/index.js";
import { CoursesController, StaffCoursesController } from "./courses.controller.js";
import { CoursesService } from "./courses.service.js";

@Module({
  imports: [IdentityModule, AccessModule, EntitlementsModule],
  controllers: [CoursesController, StaffCoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
