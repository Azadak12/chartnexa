import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  LEADERBOARD_LIMIT,
  type Leaderboard,
  type LeaderboardQuery,
  type LeaderboardSettings,
} from "@chartnexa/api-contracts";
import { PrismaService } from "../../database/prisma.service.js";
import { AuditService } from "../access/index.js";

export interface Actor {
  userId: string;
  requestId?: string | undefined;
}

/** Start of the current UTC week (Monday 00:00) or month (the 1st), or null for all time. */
export function periodStart(period: LeaderboardQuery["period"], now: Date): Date | null {
  if (period === "all") return null;
  if (period === "monthly") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const day = (now.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
}

/**
 * Ranks learners by verified lesson completions only: one `lesson_completions` row per lesson,
 * written by the existing completion rules (including the 90% video rule), so the count cannot be
 * farmed by repeating an activity. Nothing about quiz results, failures, purchases or trading
 * enters the ranking. Only learners who opted in, are active and have a display name appear, and
 * responses carry no ids or emails. Learners with equal counts share a rank (1, 2, 2, 4).
 * Ranks are computed per request over everyone opted in: fine at pilot scale.
 */
@Injectable()
export class LeaderboardService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async settings(userId: string): Promise<LeaderboardSettings> {
    const u = await this.db.user.findUnique({
      where: { id: userId },
      select: { leaderboardOptIn: true },
    });
    return { optedIn: u?.leaderboardOptIn ?? false };
  }

  /** Appearing under a public name needs a name: nobody is listed by email or id. */
  async setOptIn(actor: Actor, optedIn: boolean): Promise<LeaderboardSettings> {
    const u = await this.db.user.findUnique({
      where: { id: actor.userId },
      select: { displayName: true, leaderboardOptIn: true },
    });
    if (!u) throw new NotFoundException("Account not found.");
    if (optedIn && !u.displayName?.trim()) {
      throw new ConflictException("Add a display name to your profile before joining.");
    }
    if (u.leaderboardOptIn !== optedIn) {
      await this.db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: actor.userId }, data: { leaderboardOptIn: optedIn } });
        await this.audit.record(tx, {
          actorKind: "user",
          actorUserId: actor.userId,
          action: optedIn ? "leaderboard.join" : "leaderboard.leave",
          targetType: "user",
          targetId: actor.userId,
          outcome: "success",
          requestId: actor.requestId ?? null,
        });
      });
    }
    return { optedIn };
  }

  async board(userId: string, q: LeaderboardQuery, now: Date = new Date()): Promise<Leaderboard> {
    if (q.courseId) {
      const c = await this.db.course.findUnique({
        where: { id: q.courseId },
        select: { status: true },
      });
      if (!c || c.status !== "published") throw new NotFoundException("Course not found.");
    }
    const since = periodStart(q.period, now);
    const groups = await this.db.lessonCompletion.groupBy({
      by: ["userId"],
      where: {
        ...(since ? { completedAt: { gte: since } } : {}),
        ...(q.courseId ? { courseId: q.courseId } : {}),
        user: {
          leaderboardOptIn: true,
          status: "active",
          deletedAt: null,
          displayName: { not: null },
        },
      },
      _count: { lessonId: true },
    });
    const sorted = groups
      .map((g) => ({ userId: g.userId, n: g._count.lessonId }))
      .sort((a, b) => b.n - a.n || (a.userId < b.userId ? -1 : 1));
    // Competition ranking: the first learner with a count sets the rank for everyone with it.
    const firstAt = new Map<number, number>();
    sorted.forEach((r, i) => {
      if (!firstAt.has(r.n)) firstAt.set(r.n, i + 1);
    });
    const ranked = sorted.map((r) => ({ ...r, rank: firstAt.get(r.n)! }));
    const top = ranked.slice(0, LEADERBOARD_LIMIT);
    const names = await this.db.user.findMany({
      where: { id: { in: top.map((t) => t.userId) } },
      select: { id: true, displayName: true },
    });
    const nameOf = new Map(names.map((n) => [n.id, n.displayName?.trim() ?? ""]));
    const mine = ranked.find((r) => r.userId === userId);
    const optedIn = (await this.settings(userId)).optedIn;
    return {
      period: q.period,
      since: since?.toISOString() ?? null,
      courseId: q.courseId ?? null,
      entries: top.map((t) => ({
        rank: t.rank,
        displayName: nameOf.get(t.userId) || "Learner",
        completedLessons: t.n,
        isMe: t.userId === userId,
      })),
      me: {
        optedIn,
        rank: optedIn && mine ? mine.rank : null,
        completedLessons: optedIn && mine ? mine.n : null,
      },
    };
  }
}
