import { Module } from "@nestjs/common";
import { AccessModule } from "../access/index.js";
import { IdentityModule } from "../identity/index.js";
import {
  AcceptInvitationController,
  StaffInvitationsController,
} from "./invitations.controller.js";
import { InvitationsService } from "./invitations.service.js";

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [StaffInvitationsController, AcceptInvitationController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
