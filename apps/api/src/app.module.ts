import { type DynamicModule, Module, type Type } from "@nestjs/common";
import type { AppConfig } from "./config/config.js";
import { ConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health/health.controller.js";
import { CategoriesModule } from "./modules/categories/index.js";
import { CoursesModule } from "./modules/courses/index.js";
import { EntitlementsModule } from "./modules/entitlements/index.js";
import { LessonsModule } from "./modules/lessons/index.js";
import { AccessModule } from "./modules/access/index.js";
import { IdentityModule } from "./modules/identity/index.js";
import { MailerModule } from "./modules/mailer/index.js";
import { MfaModule } from "./modules/mfa/index.js";
import { PaymentsModule } from "./modules/payments/index.js";
import { ResourcesModule } from "./modules/resources/index.js";
import { ReviewsModule } from "./modules/reviews/index.js";
import { ProgressModule } from "./modules/progress/index.js";
import { RateLimitModule } from "./modules/rate-limit/index.js";

@Module({})
export class AppModule {
  static forRoot(config: AppConfig, extraControllers: Type<unknown>[] = []): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        DatabaseModule,
        MailerModule,
        RateLimitModule,
        IdentityModule,
        AccessModule,
        MfaModule,
        EntitlementsModule,
        CoursesModule,
        CategoriesModule,
        LessonsModule,
        ProgressModule,
        ReviewsModule,
        ResourcesModule,
        PaymentsModule,
      ],
      controllers: [HealthController, ...extraControllers],
    };
  }
}
