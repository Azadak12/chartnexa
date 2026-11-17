import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service.js";
import { RateLimitedException } from "../../platform/rate-limited.exception.js";

const WINDOW_START = (seconds: number) =>
  `to_timestamp(floor(extract(epoch from now()) / ${Number(seconds)}) * ${Number(seconds)})`;

/**
 * Fixed-window counters stored in PostgreSQL so every API instance enforces the same limits.
 * Redis can replace this when measured load justifies it (ADR-0002).
 */
@Injectable()
export class RateLimiterService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  /** Records one hit and returns the count in the current window plus seconds until reset. */
  async hit(key: string, windowSeconds: number): Promise<{ count: number; retryAfter: number }> {
    const rows = await this.db.$queryRawUnsafe<{ count: number; retry_after: number }[]>(
      `INSERT INTO rate_limits (key, window_start, count)
       VALUES ($1, ${WINDOW_START(windowSeconds)}, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
       RETURNING count, ceil(extract(epoch from (window_start + make_interval(secs => $2) - now())))::int AS retry_after`,
      key,
      windowSeconds,
    );
    const row = rows[0];
    void this.maybePurge();
    return { count: row?.count ?? 1, retryAfter: Math.max(1, row?.retry_after ?? windowSeconds) };
  }

  /** Current count without recording a hit. */
  async peek(key: string, windowSeconds: number): Promise<{ count: number; retryAfter: number }> {
    const rows = await this.db.$queryRawUnsafe<{ count: number; retry_after: number }[]>(
      `SELECT count, ceil(extract(epoch from (window_start + make_interval(secs => $2) - now())))::int AS retry_after
         FROM rate_limits WHERE key = $1 AND window_start = ${WINDOW_START(windowSeconds)}`,
      key,
      windowSeconds,
    );
    const row = rows[0];
    return { count: row?.count ?? 0, retryAfter: Math.max(1, row?.retry_after ?? windowSeconds) };
  }

  /** Counts this request and rejects once the count exceeds max. */
  async consume(key: string, max: number, windowSeconds: number): Promise<void> {
    const { count, retryAfter } = await this.hit(key, windowSeconds);
    if (count > max) throw new RateLimitedException(retryAfter);
  }

  /** Rejects when the window already holds max or more hits, without counting this request. */
  async assertBelow(key: string, max: number, windowSeconds: number): Promise<void> {
    const { count, retryAfter } = await this.peek(key, windowSeconds);
    if (count >= max) throw new RateLimitedException(retryAfter);
  }

  private async maybePurge(): Promise<void> {
    if (Math.random() > 0.01) return;
    await this.db
      .$executeRawUnsafe(`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`)
      .catch(() => undefined);
  }
}
