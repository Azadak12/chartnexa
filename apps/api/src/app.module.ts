import { type DynamicModule, Module, type Type } from "@nestjs/common";
import type { AppConfig } from "./config/config.js";
import { ConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health/health.controller.js";
import { CoursesModule } from "./modules/courses/index.js";
import { AccessModule } from "./modules/access/index.js";
import { IdentityModule } from "./modules/identity/index.js";
import { MailerModule } from "./modules/mailer/index.js";
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
        CoursesModule,
      ],
      controllers: [HealthController, ...extraControllers],
    };
  }
}
