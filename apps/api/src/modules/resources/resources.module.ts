import { Inject, Module, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { AccessModule } from "../access/index.js";
import { IdentityModule } from "../identity/index.js";
import { LessonsModule } from "../lessons/index.js";
import {
  FilesController,
  PublicResourcesController,
  StaffResourcesController,
} from "./resources.controller.js";
import { ResourcesService } from "./resources.service.js";
import { MALWARE_SCANNER, NoScanner } from "./scanner.js";
import { LocalDiskStorage, OBJECT_STORAGE } from "./storage.js";

const CLEANUP_EVERY_MS = 15 * 60 * 1000;

@Module({
  imports: [IdentityModule, AccessModule, LessonsModule],
  controllers: [StaffResourcesController, PublicResourcesController, FilesController],
  providers: [
    ResourcesService,
    {
      provide: OBJECT_STORAGE,
      useFactory: (c: AppConfig) => new LocalDiskStorage(c.STORAGE_DIR),
      inject: [CONFIG],
    },
    { provide: MALWARE_SCANNER, useClass: NoScanner },
  ],
  exports: [ResourcesService],
})
export class ResourcesModule implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  constructor(
    @Inject(ResourcesService) private readonly resources: ResourcesService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /** Periodic cleanup of expired uploads and unreferenced bytes; off in tests (they call it). */
  onModuleInit(): void {
    if (this.config.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      void this.resources.cleanup().catch(() => undefined);
    }, CLEANUP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
