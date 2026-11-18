import { Module } from "@nestjs/common";
import { AccessModule } from "../access/index.js";
import { IdentityModule } from "../identity/index.js";
import { CategoriesController, StaffCategoriesController } from "./categories.controller.js";
import { CategoriesService } from "./categories.service.js";

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [CategoriesController, StaffCategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
