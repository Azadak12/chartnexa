import { Inject, Module } from "@nestjs/common";
import { AccessModule } from "../access/index.js";
import { AccountDeletionHooks, IdentityModule } from "../identity/index.js";
import { ResourcesModule } from "../resources/index.js";
import {
  AssignmentFilesController,
  MyAssignmentsController,
  StaffAssignmentsController,
} from "./assignments.controller.js";
import { AssignmentsService } from "./assignments.service.js";

@Module({
  imports: [IdentityModule, AccessModule, ResourcesModule],
  controllers: [StaffAssignmentsController, MyAssignmentsController, AssignmentFilesController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {
  constructor(
    @Inject(AccountDeletionHooks) hooks: AccountDeletionHooks,
    @Inject(AssignmentsService) svc: AssignmentsService,
  ) {
    hooks.register((tx, userId) => svc.deleteForAccount(tx, userId));
  }
}
