import { Module } from "@nestjs/common";
import { AccessModule } from "../access/index.js";
import { IdentityModule } from "../identity/index.js";
import { LeaderboardController } from "./leaderboard.controller.js";
import { LeaderboardService } from "./leaderboard.service.js";

@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [LeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
