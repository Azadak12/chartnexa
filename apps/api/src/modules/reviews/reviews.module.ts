import { Inject, Module } from "@nestjs/common";
import { AccessModule } from "../access/index.js";
import { CoursesModule } from "../courses/index.js";
import { EntitlementsModule } from "../entitlements/index.js";
import { AccountDeletionHooks, IdentityModule } from "../identity/index.js";
import { RateLimitModule } from "../rate-limit/index.js";
import {
  MyReviewController,
  PublicReviewsController,
  StaffReviewsController,
} from "./reviews.controller.js";
import { ModerationService } from "./moderation.service.js";
import { ReviewsService } from "./reviews.service.js";

@Module({
  imports: [IdentityModule, AccessModule, CoursesModule, EntitlementsModule, RateLimitModule],
  controllers: [PublicReviewsController, MyReviewController, StaffReviewsController],
  providers: [ReviewsService, ModerationService],
  exports: [ReviewsService],
})
export class ReviewsModule {
  constructor(
    @Inject(AccountDeletionHooks) hooks: AccountDeletionHooks,
    @Inject(ReviewsService) reviews: ReviewsService,
  ) {
    // A failing hook cancels the whole account deletion, so nothing is half deleted.
    hooks.register((tx, userId) => reviews.deleteForAccount(tx, userId));
  }
}
