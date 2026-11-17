import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { CONFIG, type AppConfig } from "../config/config.js";

/**
 * Forces a UTC session timezone. The driver sends JavaScript dates as zone-less UTC text,
 * which PostgreSQL would otherwise read in the server's own zone and shift by hours.
 */
function withUtcTimezone(url: string): string {
  const u = new URL(url);
  u.searchParams.set("options", "-c timezone=UTC");
  return u.toString();
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(CONFIG) config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: withUtcTimezone(config.DATABASE_URL),
        max: config.DATABASE_POOL_MAX,
      }),
    });
  }

  /** Cheap reachability probe with a short timeout. Returns false instead of throwing. */
  async isReachable(timeoutMs = 2000): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
        }),
      ]);
      return true;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
