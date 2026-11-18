import { Inject, Module } from "@nestjs/common";
import { CoursesModule } from "../courses/index.js";
import { EntitlementsModule } from "../entitlements/index.js";
import { AccountDeletionHooks, IdentityModule } from "../identity/index.js";
import { RateLimitModule } from "../rate-limit/index.js";
import { MyReviewController, PublicReviewsController } from "./reviews.controller.js";
import { ReviewsService } from "./reviews.service.js";

@Module({
  imports: [IdentityModule, CoursesModule, EntitlementsModule, RateLimitModule],
  controllers: [PublicReviewsController, MyReviewController],
  providers: [ReviewsService],
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
