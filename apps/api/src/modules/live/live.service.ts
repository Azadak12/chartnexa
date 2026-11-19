import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  LESSON_ERROR_CODES,
  LIVE_ERROR_CODES,
  LIVE_MAX_DAYS_AHEAD,
  LIVE_MAX_UPCOMING_PER_COURSE,
  type CancelLiveSessionRequest,
  type CreateLiveSessionRequest,
  type LiveJoin,
  type LiveSession,
  type LiveSessionList,
  type LiveState,
  type StaffLiveSession,
  type StaffLiveSessionList,
  type UpdateLiveSessionRequest,
} from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { ValidationFailed } from "../../platform/zod.pipe.js";
import { AuditService } from "../access/index.js";
import { CoursesService } from "../courses/index.js";
import { EntitlementsService } from "../entitlements/index.js";
import { LIVE_PROVIDER, type LiveProvider } from "./live-provider.js";

type Tx = Prisma.TransactionClient;
export interface Actor {
  userId: string;
  requestId?: string | undefined;
}

interface Row {
  id: string;
  courseId: string;
  title: string;
  description: string;
  startsAt: Date;
  durationMinutes: number;
  provider: string;
  joinUrl: string;
  status: string;
  cancelReason: string | null;
  cancelledAt: Date | null;
  version: number;
  createdAt: Date;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Students see classes that ended within this many days, so a missed class is explained. */
const RECENT_DAYS = 14;
const NO_ACCESS = "Enroll in this course to see its live classes.";
const STALE = "This class was changed by someone else. Reload it and try again.";
const NOT_FOUND = "Live class not found.";

const endOf = (r: Pick<Row, "startsAt" | "durationMinutes">) =>
  new Date(r.startsAt.getTime() + r.durationMinutes * MINUTE);

@Injectable()
export class LiveService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CoursesService) private readonly courses: CoursesService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(LIVE_PROVIDER) private readonly provider: LiveProvider,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  // --- state ---------------------------------------------------------------------------------

  private opensAt(r: Pick<Row, "startsAt">): Date {
    return new Date(r.startsAt.getTime() - this.config.LIVE_JOIN_OPENS_MINUTES * MINUTE);
  }

  stateOf(r: Pick<Row, "status" | "startsAt" | "durationMinutes">, now = new Date()): LiveState {
    if (r.status === "cancelled") return "cancelled";
    if (now >= endOf(r)) return "ended";
    if (now >= r.startsAt) return "live";
    if (now >= this.opensAt(r)) return "open";
    return "upcoming";
  }

  private base(r: Row, now: Date) {
    return {
      id: r.id,
      courseId: r.courseId,
      title: r.title,
      description: r.description,
      startsAt: r.startsAt.toISOString(),
      endsAt: endOf(r).toISOString(),
      durationMinutes: r.durationMinutes,
      state: this.stateOf(r, now),
      joinOpensAt: this.opensAt(r).toISOString(),
      cancelReason: r.cancelReason,
    };
  }

  private toStaff(r: Row, joinedCount: number, now = new Date()): StaffLiveSession {
    return {
      ...this.base(r, now),
      joinUrl: r.joinUrl,
      provider: r.provider,
      version: r.version,
      joinedCount,
      createdAt: r.createdAt.toISOString(),
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
    };
  }

  private record(tx: Tx, actor: Actor, action: string, id: string, detail: object) {
    return this.audit.record(tx, {
      actorKind: "user",
      actorUserId: actor.userId,
      action,
      targetType: "live_session",
      targetId: id,
      outcome: "success",
      ...detail,
      requestId: actor.requestId ?? null,
    });
  }

  /** The start must be ahead of now and not too far away; a class must end in the future. */
  private checkTimes(startsAt: Date, now: Date): void {
    if (startsAt.getTime() <= now.getTime()) {
      throw new ValidationFailed([
        { field: "startsAt", message: "Choose a start time in the future" },
      ]);
    }
    if (startsAt.getTime() > now.getTime() + LIVE_MAX_DAYS_AHEAD * DAY) {
      throw new ValidationFailed([
        { field: "startsAt", message: `Choose a start within ${LIVE_MAX_DAYS_AHEAD} days` },
      ]);
    }
  }

  private link(url: string): string {
    const ok = this.provider.acceptLink(url);
    if (!ok) {
      throw new ValidationFailed([
        { field: "joinUrl", message: "Use an https:// meeting link without a password in it" },
      ]);
    }
    return ok;
  }

  private async joinedCounts(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.liveAttendance.groupBy({
      by: ["sessionId"],
      where: { sessionId: { in: ids } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.sessionId, r._count._all]));
  }

  private async lockSession(tx: Tx, courseId: string, id: string): Promise<Row> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM live_sessions WHERE id = ${id}::uuid AND course_id = ${courseId}::uuid
      FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundException(NOT_FOUND);
    return (await tx.liveSession.findUniqueOrThrow({ where: { id } })) as Row;
  }

  // --- staff ---------------------------------------------------------------------------------

  async listStaff(courseId: string): Promise<StaffLiveSessionList> {
    const course = await this.db.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException("Course not found.");
    const rows = (await this.db.liveSession.findMany({
      where: { courseId },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 500,
    })) as Row[];
    const counts = await this.joinedCounts(rows.map((r) => r.id));
    const now = new Date();
    return { items: rows.map((r) => this.toStaff(r, counts.get(r.id) ?? 0, now)) };
  }

  async create(
    actor: Actor,
    courseId: string,
    input: CreateLiveSessionRequest,
  ): Promise<StaffLiveSession> {
    const now = new Date();
    const startsAt = new Date(input.startsAt);
    this.checkTimes(startsAt, now);
    const joinUrl = this.link(input.joinUrl);
    return this.db.$transaction(async (tx) => {
      // The course lock makes the "how many upcoming" count exact when two staff add at once.
      await this.courses.lockForUpdate(tx, courseId);
      const upcoming = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM live_sessions
        WHERE course_id = ${courseId}::uuid AND status = 'scheduled'
          AND starts_at + make_interval(mins => duration_minutes) > now()`;
      if ((upcoming[0]?.n ?? 0) >= LIVE_MAX_UPCOMING_PER_COURSE) {
        throw new ConflictException({
          message: `A course can have at most ${LIVE_MAX_UPCOMING_PER_COURSE} upcoming live classes.`,
          code: LIVE_ERROR_CODES.tooMany,
        });
      }
      const row = (await tx.liveSession.create({
        data: {
          courseId,
          title: input.title,
          description: input.description ?? "",
          startsAt,
          durationMinutes: input.durationMinutes,
          provider: this.provider.name,
          joinUrl,
          createdBy: actor.userId,
        },
      })) as Row;
      await this.record(tx, actor, "live.create", row.id, {
        after: {
          courseId,
          title: row.title,
          startsAt: row.startsAt.toISOString(),
          durationMinutes: row.durationMinutes,
          provider: row.provider,
        },
      });
      return this.toStaff(row, 0);
    });
  }

  async update(
    actor: Actor,
    courseId: string,
    id: string,
    input: UpdateLiveSessionRequest,
  ): Promise<StaffLiveSession> {
    return this.db.$transaction(async (tx) => {
      const current = await this.lockSession(tx, courseId, id);
      const now = new Date();
      const state = this.stateOf(current, now);
      if (state === "cancelled") {
        throw new ConflictException({
          message: "This class was cancelled and can no longer change.",
          code: LIVE_ERROR_CODES.cancelled,
        });
      }
      if (state === "ended") {
        throw new ConflictException({
          message: "This class has ended and can no longer change.",
          code: LIVE_ERROR_CODES.ended,
        });
      }
      if (current.version !== input.expectedVersion) throw new ConflictException(STALE);

      const next = {
        title: input.title ?? current.title,
        description: input.description ?? current.description,
        startsAt: input.startsAt ? new Date(input.startsAt) : current.startsAt,
        durationMinutes: input.durationMinutes ?? current.durationMinutes,
        joinUrl: input.joinUrl !== undefined ? this.link(input.joinUrl) : current.joinUrl,
      };
      const moved = next.startsAt.getTime() !== current.startsAt.getTime();
      if (moved) {
        if (state === "live") {
          throw new ValidationFailed([
            { field: "startsAt", message: "This class has started; its start can no longer move" },
          ]);
        }
        this.checkTimes(next.startsAt, now);
      }
      if (endOf(next).getTime() <= now.getTime()) {
        throw new ValidationFailed([
          { field: "durationMinutes", message: "The class would already be over; choose longer" },
        ]);
      }

      const fields = ["title", "description", "startsAt", "durationMinutes", "joinUrl"] as const;
      const changed = fields.filter((f) =>
        f === "startsAt" ? moved : next[f] !== (current as unknown as typeof next)[f],
      );
      if (changed.length === 0) return this.toStaff(current, await this.countOne(tx, id), now);

      const row = (await tx.liveSession.update({
        where: { id },
        data: { ...next, version: { increment: 1 }, updatedAt: now },
      })) as Row;
      // The link is not written to the audit log: anyone with it could enter the class.
      const show = (r: typeof next) =>
        Object.fromEntries(
          changed
            .filter((f) => f !== "joinUrl" && f !== "description")
            .map((f) => [f, f === "startsAt" ? r.startsAt.toISOString() : r[f]]),
        );
      await this.record(tx, actor, "live.update", id, {
        before: show(current),
        after: {
          ...show(next),
          ...(changed.includes("joinUrl") ? { joinUrlChanged: true } : {}),
          ...(changed.includes("description") ? { descriptionChanged: true } : {}),
        },
      });
      return this.toStaff(row, await this.countOne(tx, id), now);
    });
  }

  /** Cancelling twice answers with the cancelled class and changes nothing. */
  async cancel(
    actor: Actor,
    courseId: string,
    id: string,
    input: CancelLiveSessionRequest,
  ): Promise<StaffLiveSession> {
    return this.db.$transaction(async (tx) => {
      const current = await this.lockSession(tx, courseId, id);
      const now = new Date();
      const state = this.stateOf(current, now);
      if (state === "cancelled") return this.toStaff(current, await this.countOne(tx, id), now);
      if (state === "ended") {
        throw new ConflictException({
          message: "This class has already ended.",
          code: LIVE_ERROR_CODES.ended,
        });
      }
      if (current.version !== input.expectedVersion) throw new ConflictException(STALE);
      const row = (await tx.liveSession.update({
        where: { id },
        data: {
          status: "cancelled",
          cancelReason: input.reason,
          cancelledAt: now,
          version: { increment: 1 },
          updatedAt: now,
        },
      })) as Row;
      await this.record(tx, actor, "live.cancel", id, {
        before: { status: "scheduled", state },
        after: { status: "cancelled" },
      });
      return this.toStaff(row, await this.countOne(tx, id), now);
    });
  }

  private countOne(tx: Tx, id: string): Promise<number> {
    return tx.liveAttendance.count({ where: { sessionId: id } });
  }

  // --- students ------------------------------------------------------------------------------

  private async requireOwner(userId: string, courseId: string): Promise<void> {
    if (!(await this.entitlements.hasActive(userId, courseId))) {
      throw new ForbiddenException({
        message: NO_ACCESS,
        code: LESSON_ERROR_CODES.enrollmentRequired,
      });
    }
  }

  private async withTitles(rows: Row[], now: Date): Promise<LiveSession[]> {
    const ids = [...new Set(rows.map((r) => r.courseId))];
    const courses = await this.db.course.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true },
    });
    const titles = new Map(courses.map((c) => [c.id, c.title]));
    return rows.map((r) => ({ ...this.base(r, now), courseTitle: titles.get(r.courseId) ?? "" }));
  }

  /** A course's classes for its owners: everything not yet over, and what ended recently. */
  async listForCourse(userId: string, courseId: string): Promise<LiveSessionList> {
    await this.requireOwner(userId, courseId);
    const now = new Date();
    const rows = (
      await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM live_sessions
      WHERE course_id = ${courseId}::uuid
        AND starts_at + make_interval(mins => duration_minutes) > ${new Date(now.getTime() - RECENT_DAYS * DAY)}
      ORDER BY starts_at ASC, id ASC LIMIT 200`
    ).map((r) => r.id);
    const full = (await this.db.liveSession.findMany({
      where: { id: { in: rows } },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    })) as Row[];
    return { items: await this.withTitles(full, now) };
  }

  /** Classes not yet over in every course the person owns, soonest first (for the home screen). */
  async listMine(userId: string): Promise<LiveSessionList> {
    const now = new Date();
    const ids = (
      await this.db.$queryRaw<{ id: string }[]>`
      SELECT s.id FROM live_sessions s
      JOIN entitlements e ON e.course_id = s.course_id AND e.user_id = ${userId}::uuid
        AND e.status = 'active'
      WHERE s.starts_at + make_interval(mins => s.duration_minutes) > ${now}
      ORDER BY s.starts_at ASC, s.id ASC LIMIT 50`
    ).map((r) => r.id);
    const rows = (await this.db.liveSession.findMany({
      where: { id: { in: ids } },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    })) as Row[];
    return { items: await this.withTitles(rows, now) };
  }

  /**
   * The join link, only from when the class opens until it ends. The first request is recorded
   * once per person; asking again changes nothing.
   */
  async join(userId: string, courseId: string, id: string): Promise<LiveJoin> {
    await this.requireOwner(userId, courseId);
    const row = (await this.db.liveSession.findFirst({ where: { id, courseId } })) as Row | null;
    if (!row) throw new NotFoundException(NOT_FOUND);
    const state = this.stateOf(row);
    if (state === "cancelled") {
      throw new ConflictException({
        message: "This class was cancelled.",
        code: LIVE_ERROR_CODES.cancelled,
      });
    }
    if (state === "ended") {
      throw new ConflictException({
        message: "This class has ended.",
        code: LIVE_ERROR_CODES.ended,
      });
    }
    if (state === "upcoming") {
      throw new ConflictException({
        message: `You can join from ${this.config.LIVE_JOIN_OPENS_MINUTES} minutes before the start.`,
        code: LIVE_ERROR_CODES.notOpen,
      });
    }
    await this.db.$executeRaw`
      INSERT INTO live_attendance (session_id, user_id) VALUES (${id}::uuid, ${userId}::uuid)
      ON CONFLICT (session_id, user_id) DO NOTHING`;
    return { url: this.provider.joinLinkFor(row, userId), endsAt: endOf(row).toISOString() };
  }

  /** Runs inside the account-deletion transaction. */
  async deleteForAccount(tx: Tx, userId: string): Promise<void> {
    await tx.liveAttendance.deleteMany({ where: { userId } });
  }
}
