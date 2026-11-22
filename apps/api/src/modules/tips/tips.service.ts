import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateTipRequest,
  StaffTip,
  TipCategory,
  TipOfTheDay,
} from "@chartnexa/api-contracts";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { AuditService } from "../access/index.js";

export interface Actor {
  userId: string;
  requestId?: string | undefined;
}
const DAY_MS = 86_400_000;
const include = { course: { select: { title: true, status: true } } } as const;
type Row = Prisma.DailyTipGetPayload<{ include: typeof include }>;

/** The UTC calendar day as YYYY-MM-DD, and as a whole number of days since 1970-01-01. */
export const utcDay = (now: Date) => ({
  date: now.toISOString().slice(0, 10),
  index: Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / DAY_MS),
});

/**
 * Tips are stored content written by staff. The tip for a day is a pure function of the date and
 * the active tips (oldest first): `index mod count`. So it is the same for everyone all day,
 * needs no per-user state, and every active tip is shown once before any repeats. Adding or
 * archiving a tip reorders the cycle from that point on; that is the only time a day can differ.
 */
@Injectable()
export class TipsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private toStaff(r: Row): StaffTip {
    return {
      id: r.id,
      category: r.category as TipCategory,
      body: r.body,
      courseId: r.courseId,
      courseTitle: r.course?.title ?? null,
      status: r.status as StaffTip["status"],
      createdAt: r.createdAt.toISOString(),
      archivedAt: r.archivedAt?.toISOString() ?? null,
    };
  }

  /** The `now` argument exists so tests can choose the day; the controller never passes it. */
  async ofTheDay(now: Date = new Date()): Promise<TipOfTheDay> {
    const { date, index } = utcDay(now);
    const active = await this.db.dailyTip.findMany({
      where: { status: "active" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include,
    });
    const row = active.length > 0 ? active[index % active.length]! : undefined;
    if (!row) return { date, tip: null };
    // Offer "Learn more" only for a course learners can open.
    const linked = row.course && row.course.status === "published";
    return {
      date,
      tip: {
        id: row.id,
        category: row.category as TipCategory,
        body: row.body,
        courseId: linked ? row.courseId : null,
        courseTitle: linked ? (row.course?.title ?? null) : null,
      },
    };
  }

  async listStaff(): Promise<StaffTip[]> {
    const rows = await this.db.dailyTip.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include,
    });
    return rows.map((r) => this.toStaff(r));
  }

  async create(actor: Actor, input: CreateTipRequest): Promise<StaffTip> {
    if (input.courseId) {
      const course = await this.db.course.findUnique({
        where: { id: input.courseId },
        select: { status: true },
      });
      if (!course || course.status !== "published") {
        throw new NotFoundException("Choose a published course.");
      }
    }
    return this.db.$transaction(async (tx) => {
      const row = await tx.dailyTip.create({
        data: {
          category: input.category,
          body: input.body,
          courseId: input.courseId ?? null,
          authorId: actor.userId,
        },
        include,
      });
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actor.userId,
        action: "tip.create",
        targetType: "tip",
        targetId: row.id,
        outcome: "success",
        after: { category: row.category, bodyLength: row.body.length, courseId: row.courseId },
        requestId: actor.requestId ?? null,
      });
      return this.toStaff(row);
    });
  }

  /** Archiving twice is fine: the second call changes nothing and writes no second record. */
  async archive(actor: Actor, id: string): Promise<StaffTip> {
    const found = await this.db.dailyTip.findUnique({ where: { id }, include });
    if (!found) throw new NotFoundException("Tip not found.");
    if (found.status === "archived") return this.toStaff(found);
    return this.db.$transaction(async (tx) => {
      const row = await tx.dailyTip.update({
        where: { id },
        data: { status: "archived", archivedAt: new Date() },
        include,
      });
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actor.userId,
        action: "tip.archive",
        targetType: "tip",
        targetId: id,
        outcome: "success",
        requestId: actor.requestId ?? null,
      });
      return this.toStaff(row);
    });
  }
}
