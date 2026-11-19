import { Inject, Module, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { PrismaService } from "../../database/prisma.service.js";
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
import { ClamAvScanner } from "./clamav-scanner.js";
import { PostgresStorage } from "./postgres-storage.js";
import { MALWARE_SCANNER, NoScanner } from "./scanner.js";
import { LocalDiskStorage, OBJECT_STORAGE, type ObjectStorage } from "./storage.js";
import { StaffVideoController, PublicVideoController } from "./video.controller.js";
import { DirectVideoProvider, TestVideoProvider, VIDEO_PROVIDER } from "./video-provider.js";
import { VideoService } from "./video.service.js";
import { PublicThumbnailController, StaffThumbnailController } from "./thumbnails.controller.js";
import { ThumbnailsService } from "./thumbnails.service.js";

const CLEANUP_EVERY_MS = 15 * 60 * 1000;

@Module({
  imports: [IdentityModule, AccessModule, LessonsModule, EntitlementsModule],
  controllers: [
    StaffResourcesController,
    PublicResourcesController,
    FilesController,
    StaffVideoController,
    PublicVideoController,
    StaffThumbnailController,
    PublicThumbnailController,
  ],
  providers: [
    ResourcesService,
    {
      provide: OBJECT_STORAGE,
      useFactory: (c: AppConfig, db: PrismaService): ObjectStorage =>
        c.STORAGE_DRIVER === "postgres"
          ? new PostgresStorage(db)
          : new LocalDiskStorage(c.STORAGE_DIR),
      inject: [CONFIG, PrismaService],
    },
    {
      provide: MALWARE_SCANNER,
      useFactory: (c: AppConfig) =>
        c.SCANNER === "clamav"
          ? new ClamAvScanner(c.CLAMAV_HOST as string, c.CLAMAV_PORT, c.CLAMAV_TIMEOUT_MS)
          : new NoScanner(),
      inject: [CONFIG],
    },
    VideoService,
    ThumbnailsService,
    {
      provide: VIDEO_PROVIDER,
      useFactory: (storage: ObjectStorage, c: AppConfig) =>
        c.VIDEO_PROVIDER === "direct"
          ? new DirectVideoProvider(storage)
          : new TestVideoProvider(storage),
      inject: [OBJECT_STORAGE, CONFIG],
    },
  ],
  exports: [ResourcesService, VideoService, OBJECT_STORAGE],
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
