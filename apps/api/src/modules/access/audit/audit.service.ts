import { Inject, Injectable } from "@nestjs/common";
import type { AuditEvent, Page } from "@chartnexa/api-contracts";
import type { Prisma } from "../../../generated/prisma/client.js";
import { PrismaService } from "../../../database/prisma.service.js";
import { buildPage, decodeCursor } from "../../../pagination/cursor.js";

export interface AuditInput {
  actorKind: "user" | "system";
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  outcome: "success" | "denied";
  reason?: string | null;
  /** Role or permission names and ids only: never emails, tokens or hashes. */
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  requestId?: string | null;
}

export interface AuditFilter {
  actorUserId?: string | undefined;
  targetId?: string | undefined;
  action?: string | undefined;
  outcome?: "success" | "denied" | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

type Writer = Pick<Prisma.TransactionClient, "auditEvent">;

interface Row {
  id: string;
  occurred_at: Date;
  actor_kind: string;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  outcome: string;
  reason: string | null;
  before: unknown;
  after: unknown;
  request_id: string | null;
}

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  private data(e: AuditInput) {
    return {
      actorKind: e.actorKind,
      actorUserId: e.actorUserId ?? null,
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId,
      outcome: e.outcome,
      reason: e.reason ?? null,
      // Prisma needs the explicit null marker for JSON columns.
      before: e.before ?? (undefined as never),
      after: e.after ?? (undefined as never),
      requestId: e.requestId ?? null,
    };
  }

  /** Writes inside the caller's transaction so the change and its record commit together. */
  async record(tx: Writer, e: AuditInput): Promise<void> {
    await tx.auditEvent.create({ data: this.data(e) });
  }

  /** For attempts that changed nothing; written on its own because no change transaction exists. */
  async recordDenied(e: Omit<AuditInput, "outcome">): Promise<void> {
    await this.db.auditEvent.create({ data: this.data({ ...e, outcome: "denied" }) });
  }

  async list(
    filter: AuditFilter,
    page: { limit: number; cursor?: string | undefined },
    cursorSecret: string,
  ): Promise<Page<AuditEvent>> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown): void => {
      params.push(value);
      where.push(sql.replace("?", `$${params.length}`));
    };
    if (filter.actorUserId) add("actor_user_id = ?::uuid", filter.actorUserId);
    if (filter.targetId) add("target_id = ?", filter.targetId);
    if (filter.action) add("action = ?", filter.action);
    if (filter.outcome) add("outcome = ?", filter.outcome);
    if (filter.from) add("occurred_at >= ?::timestamptz", filter.from);
    if (filter.to) add("occurred_at <= ?::timestamptz", filter.to);
    if (page.cursor) {
      const [ts, id] = decodeCursor(page.cursor, cursorSecret);
      params.push(String(ts), String(id));
      where.push(
        `(occurred_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
      );
    }
    params.push(page.limit + 1);
    const sql = `SELECT id, occurred_at, actor_kind, actor_user_id, action, target_type, target_id,
                        outcome, reason, before, after, request_id
                   FROM audit_events
                  ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
                  ORDER BY occurred_at DESC, id DESC
                  LIMIT $${params.length}`;
    const rows = await this.db.$queryRawUnsafe<Row[]>(sql, ...params);
    const mapped = rows.map<AuditEvent & { _at: string }>((r) => ({
      id: r.id,
      occurredAt: r.occurred_at.toISOString(),
      actorKind: r.actor_kind as "user" | "system",
      actorUserId: r.actor_user_id,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      outcome: r.outcome as "success" | "denied",
      reason: r.reason,
      before: r.before ?? null,
      after: r.after ?? null,
      requestId: r.request_id,
      _at: r.occurred_at.toISOString(),
    }));
    const result = buildPage(mapped, page.limit, (r) => [r._at, r.id], cursorSecret);
    const items = result.items.map((row) => {
      const item: Partial<typeof row> = { ...row };
      delete item._at;
      return item as AuditEvent;
    });
    return { items, nextCursor: result.nextCursor };
  }
}
