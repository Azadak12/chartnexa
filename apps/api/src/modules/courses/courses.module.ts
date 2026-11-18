import { Module } from "@nestjs/common";
import { AccessModule } from "../access/index.js";
import { IdentityModule } from "../identity/index.js";
import { CoursesController, StaffCoursesController } from "./courses.controller.js";
import { CoursesService } from "./courses.service.js";

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [CoursesController, StaffCoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
