import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  PAYMENT_ERROR_CODES,
  type Announcement,
  type Page,
  type AnnouncementPageQuery,
  type CreateAnnouncementRequest,
  type StaffAnnouncement,
  type WithdrawAnnouncementRequest,
} from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { buildPage, decodeCursor } from "../../pagination/cursor.js";
import { AuditService } from "../access/index.js";

type Tx = Prisma.TransactionClient;
export interface Actor {
  userId: string;
  requestId?: string | undefined;
}
const DEFAULT_LIMIT = 20;
const NOT_FOUND = "Announcement not found.";

const include = { course: { select: { title: true } } } as const;
type Row = Prisma.AnnouncementGetPayload<{ include: typeof include }>;

/**
 * Announcements reach everyone signed in (no course) or the people with active access to one
 * course. The visibility rule lives in one place, `visibleTo`, and every reader goes through it.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private visibleTo(userId: string): Prisma.AnnouncementWhereInput {
    return {
      status: "published",
      OR: [
        { courseId: null },
        { course: { entitlements: { some: { userId, status: "active" } } } },
      ],
    };
  }

  private cursorWhere(cursor: string | undefined): Prisma.AnnouncementWhereInput {
    if (!cursor) return {};
    const [ts, id] = decodeCursor(cursor, this.config.CURSOR_SECRET);
    const at = new Date(String(ts));
    return { OR: [{ publishedAt: { lt: at } }, { publishedAt: at, id: { lt: String(id) } }] };
  }

  private toStaff(r: Row, readCount: number): StaffAnnouncement {
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      courseId: r.courseId,
      courseTitle: r.course?.title ?? null,
      status: r.status as StaffAnnouncement["status"],
      publishedAt: r.publishedAt.toISOString(),
      withdrawnAt: r.withdrawnAt?.toISOString() ?? null,
      withdrawReason: r.withdrawReason,
      authorId: r.authorId,
      readCount,
    };
  }

  private record(tx: Tx, actor: Actor, action: string, id: string, detail: object) {
    return this.audit.record(tx, {
      actorKind: "user",
      actorUserId: actor.userId,
      action,
      targetType: "announcement",
      targetId: id,
      outcome: "success",
      ...detail,
      requestId: actor.requestId ?? null,
    });
  }

  // --- staff ---------------------------------------------------------------------------------

  /** Posting twice with the same key answers the first announcement; a different body is 409. */
  async publish(actor: Actor, input: CreateAnnouncementRequest): Promise<StaffAnnouncement> {
    const same = (r: Row) =>
      r.title === input.title && r.body === input.body && r.courseId === (input.courseId ?? null);
    const existing = await this.db.announcement.findUnique({
      where: {
        authorId_idempotencyKey: { authorId: actor.userId, idempotencyKey: input.idempotencyKey },
      },
      include,
    });
    if (existing) return this.replay(existing, same);
    if (input.courseId) {
      const course = await this.db.course.findUnique({
        where: { id: input.courseId },
        select: { id: true },
      });
      if (!course) throw new NotFoundException("Course not found.");
    }
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.announcement.create({
          data: {
            title: input.title,
            body: input.body,
            courseId: input.courseId ?? null,
            authorId: actor.userId,
            idempotencyKey: input.idempotencyKey,
          },
          include,
        });
        await this.record(tx, actor, "announcement.publish", row.id, {
          after: {
            audience: row.courseId ? "course" : "everyone",
            courseId: row.courseId,
            title: row.title,
            bodyLength: row.body.length,
          },
        });
        return this.toStaff(row, 0);
      });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
      // A simultaneous retry with the same key won the race.
      const again = await this.db.announcement.findUnique({
        where: {
          authorId_idempotencyKey: { authorId: actor.userId, idempotencyKey: input.idempotencyKey },
        },
        include,
      });
      if (!again) throw e;
      return this.replay(again, same);
    }
  }

  private async replay(r: Row, same: (r: Row) => boolean): Promise<StaffAnnouncement> {
    if (!same(r)) {
      throw new ConflictException({
        message: "This request key was already used for a different announcement.",
        code: PAYMENT_ERROR_CODES.keyReused,
      });
    }
    return this.toStaff(
      r,
      await this.db.announcementRead.count({ where: { announcementId: r.id } }),
    );
  }

  /** Withdrawn announcements disappear for readers; repeating it changes nothing. */
  async withdraw(
    actor: Actor,
    id: string,
    input: WithdrawAnnouncementRequest,
  ): Promise<StaffAnnouncement> {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM announcements WHERE id = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException(NOT_FOUND);
      const current = await tx.announcement.findUniqueOrThrow({ where: { id }, include });
      const reads = await tx.announcementRead.count({ where: { announcementId: id } });
      if (current.status === "withdrawn") return this.toStaff(current, reads);
      const row = await tx.announcement.update({
        where: { id },
        data: {
          status: "withdrawn",
          withdrawnAt: new Date(),
          withdrawReason: input.reason,
          withdrawnBy: actor.userId,
        },
        include,
      });
      await this.record(tx, actor, "announcement.withdraw", id, {
        reason: input.reason,
        before: { status: "published" },
        after: { status: "withdrawn" },
      });
      return this.toStaff(row, reads);
    });
  }

  async listStaff(q: AnnouncementPageQuery): Promise<Page<StaffAnnouncement>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const rows = await this.db.announcement.findMany({
      where: this.cursorWhere(q.cursor),
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: { ...include, _count: { select: { reads: true } } },
    });
    const page = buildPage(
      rows,
      limit,
      (r) => [r.publishedAt.toISOString(), r.id],
      this.config.CURSOR_SECRET,
    );
    return {
      items: page.items.map((r) => this.toStaff(r, r._count.reads)),
      nextCursor: page.nextCursor,
    };
  }

  // --- readers -------------------------------------------------------------------------------

  async listMine(userId: string, q: AnnouncementPageQuery): Promise<Page<Announcement>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const rows = await this.db.announcement.findMany({
      where: { AND: [this.visibleTo(userId), this.cursorWhere(q.cursor)] },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: { ...include, reads: { where: { userId }, select: { userId: true } } },
    });
    const page = buildPage(
      rows,
      limit,
      (r) => [r.publishedAt.toISOString(), r.id],
      this.config.CURSOR_SECRET,
    );
    return {
      items: page.items.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        courseId: r.courseId,
        courseTitle: r.course?.title ?? null,
        publishedAt: r.publishedAt.toISOString(),
        read: r.reads.length > 0,
      })),
      nextCursor: page.nextCursor,
    };
  }

  async unreadCount(userId: string): Promise<{ unread: number }> {
    const unread = await this.db.announcement.count({
      where: { AND: [this.visibleTo(userId), { reads: { none: { userId } } }] },
    });
    return { unread };
  }

  /** Marks one announcement read. Someone who cannot see it gets 404, so its existence stays private. */
  async markRead(userId: string, id: string): Promise<{ read: true }> {
    const visible = await this.db.announcement.findFirst({
      where: { AND: [{ id }, this.visibleTo(userId)] },
      select: { id: true },
    });
    if (!visible) throw new NotFoundException(NOT_FOUND);
    await this.db.$executeRaw`
      INSERT INTO announcement_reads (announcement_id, user_id) VALUES (${id}::uuid, ${userId}::uuid)
      ON CONFLICT (announcement_id, user_id) DO NOTHING`;
    return { read: true };
  }

  async deleteForAccount(tx: Tx, userId: string): Promise<void> {
    await tx.announcementRead.deleteMany({ where: { userId } });
  }
}
