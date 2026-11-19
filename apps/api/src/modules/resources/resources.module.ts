import { Inject, Module, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { AccessModule } from "../access/index.js";
import { EntitlementsModule } from "../entitlements/index.js";
import { AccountDeletionHooks, IdentityModule } from "../identity/index.js";
import { LessonsModule } from "../lessons/index.js";
import {
  FilesController,
  PublicResourcesController,
  StaffResourcesController,
} from "./resources.controller.js";
import { ResourcesService } from "./resources.service.js";
import { MALWARE_SCANNER, NoScanner } from "./scanner.js";
import { LocalDiskStorage, OBJECT_STORAGE, type ObjectStorage } from "./storage.js";
import { StaffVideoController, PublicVideoController } from "./video.controller.js";
import { TestVideoProvider, VIDEO_PROVIDER } from "./video-provider.js";
import { VideoService } from "./video.service.js";

const CLEANUP_EVERY_MS = 15 * 60 * 1000;

@Module({
  imports: [IdentityModule, AccessModule, LessonsModule, EntitlementsModule],
  controllers: [
    StaffResourcesController,
    PublicResourcesController,
    FilesController,
    StaffVideoController,
    PublicVideoController,
  ],
  providers: [
    ResourcesService,
    {
      provide: OBJECT_STORAGE,
      useFactory: (c: AppConfig) => new LocalDiskStorage(c.STORAGE_DIR),
      inject: [CONFIG],
    },
    { provide: MALWARE_SCANNER, useClass: NoScanner },
    VideoService,
    {
      provide: VIDEO_PROVIDER,
      useFactory: (storage: ObjectStorage) => new TestVideoProvider(storage),
      inject: [OBJECT_STORAGE],
    },
  ],
  exports: [ResourcesService, VideoService],
})
export class ResourcesModule implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  constructor(
    @Inject(ResourcesService) private readonly resources: ResourcesService,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(AccountDeletionHooks) hooks: AccountDeletionHooks,
    @Inject(VideoService) videos: VideoService,
  ) {
    hooks.register((tx, userId) => videos.deleteForAccount(tx, userId));
  }

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
