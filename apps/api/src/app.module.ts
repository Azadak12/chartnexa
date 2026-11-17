import { type DynamicModule, Module, type Type } from "@nestjs/common";
import type { AppConfig } from "./config/config.js";
import { ConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health/health.controller.js";

@Module({})
export class AppModule {
  static forRoot(config: AppConfig, extraControllers: Type<unknown>[] = []): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(config), DatabaseModule],
      controllers: [HealthController, ...extraControllers],
    };
  }
}
