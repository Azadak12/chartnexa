import { Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { SessionSummary, TokenPair } from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../../config/config.js";
import { PrismaService } from "../../../database/prisma.service.js";
import { AccessTokenService } from "../tokens/access-token.service.js";
import { hashToken, newOpaqueToken } from "../tokens/token-util.js";
import { logEvent, type RequestCtx } from "../http/request-context.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const refreshDenied = () => new UnauthorizedException("Authentication required.");

type RefreshResult =
  | { kind: "ok"; pair: TokenPair }
  | { kind: "denied"; reason: string; userId?: string; sessionId?: string };

@Injectable()
export class SessionsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AccessTokenService) private readonly tokens: AccessTokenService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async createSession(userId: string, deviceLabel: string | null): Promise<TokenPair> {
    const now = Date.now();
    const absolute = new Date(now + this.config.SESSION_MAX_DAYS * DAY_MS);
    const sliding = new Date(now + this.config.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
    const refreshToken = newOpaqueToken();
    const session = await this.db.session.create({
      data: {
        userId,
        refreshHash: hashToken(refreshToken),
        deviceLabel,
        expiresAt: sliding < absolute ? sliding : absolute,
        absoluteExpiresAt: absolute,
      },
    });
    return this.pair(userId, session.id, refreshToken);
  }

  private async pair(userId: string, sessionId: string, refreshToken: string): Promise<TokenPair> {
    return {
      accessToken: await this.tokens.sign({ userId, sessionId }),
      refreshToken,
      sessionId,
      expiresIn: this.tokens.ttlSeconds,
    };
  }

  /**
   * Rotates a refresh token. The session row is locked so simultaneous use of one token
   * produces exactly one winner; any later use of a rotated token revokes the whole session.
   */
  async refresh(presented: string, ctx: RequestCtx): Promise<TokenPair> {
    const hash = hashToken(presented);
    const result = await this.db.$transaction<RefreshResult>(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM sessions WHERE refresh_hash = ${hash} OR previous_refresh_hash = ${hash} FOR UPDATE`;
      const id = locked[0]?.id;
      if (!id) return { kind: "denied", reason: "unknown_token" };

      const s = await tx.session.findUniqueOrThrow({ where: { id }, include: { user: true } });
      const now = new Date();
      if (s.revokedAt) {
        return { kind: "denied", reason: "revoked", userId: s.userId, sessionId: s.id };
      }
      if (s.refreshHash !== hash) {
        await tx.session.update({
          where: { id },
          data: { revokedAt: now, revokedReason: "reuse_detected" },
        });
        return { kind: "denied", reason: "reuse_detected", userId: s.userId, sessionId: s.id };
      }
      if (s.expiresAt <= now || s.absoluteExpiresAt <= now) {
        return { kind: "denied", reason: "expired", userId: s.userId, sessionId: s.id };
      }
      if (s.user.status !== "active") {
        await tx.session.update({
          where: { id },
          data: { revokedAt: now, revokedReason: "account_inactive" },
        });
        return { kind: "denied", reason: "account_inactive", userId: s.userId, sessionId: s.id };
      }

      const next = newOpaqueToken();
      const sliding = new Date(now.getTime() + this.config.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
      await tx.session.update({
        where: { id },
        data: {
          previousRefreshHash: s.refreshHash,
          refreshHash: hashToken(next),
          rotatedAt: now,
          lastUsedAt: now,
          expiresAt: sliding < s.absoluteExpiresAt ? sliding : s.absoluteExpiresAt,
        },
      });
      return { kind: "ok", pair: await this.pair(s.userId, s.id, next) };
    });

    if (result.kind === "ok") return result.pair;
    logEvent(
      ctx,
      result.reason === "reuse_detected" ? "auth.refresh.reuse_detected" : "auth.refresh.denied",
      {
        ...(result.userId ? { userId: result.userId } : {}),
        ...(result.sessionId ? { sessionId: result.sessionId } : {}),
        outcome: result.reason,
      },
    );
    throw refreshDenied();
  }

  async revokeSession(sessionId: string, reason: string): Promise<void> {
    await this.db.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAll(userId: string, reason: string, exceptSessionId?: string): Promise<number> {
    const r = await this.db.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return r.count;
  }

  async list(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
    const now = new Date();
    const rows = await this.db.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now }, absoluteExpiresAt: { gt: now } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      deviceLabel: r.deviceLabel,
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt.toISOString(),
      current: r.id === currentSessionId,
    }));
  }

  /** Revokes one of the caller's own sessions; anyone else's looks like it does not exist. */
  async revokeOwn(userId: string, sessionId: string): Promise<void> {
    const r = await this.db.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "user_revoked" },
    });
    if (r.count === 0) throw new NotFoundException("Session not found.");
  }
}
