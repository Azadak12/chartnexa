import { Module } from "@nestjs/common";
import { AccessModule } from "../access/index.js";
import { CoursesModule } from "../courses/index.js";
import { EntitlementsModule } from "../entitlements/index.js";
import { IdentityModule } from "../identity/index.js";
import { PublicLessonsController, StaffLessonsController } from "./lessons.controller.js";
import { StaffCourseModulesController } from "./course-modules.controller.js";
import { CourseModulesService } from "./course-modules.service.js";
import { LessonsService } from "./lessons.service.js";

@Module({
  imports: [IdentityModule, AccessModule, CoursesModule, EntitlementsModule],
  controllers: [PublicLessonsController, StaffLessonsController, StaffCourseModulesController],
  providers: [LessonsService, CourseModulesService],
  exports: [LessonsService],
})
export class LessonsModule {}
