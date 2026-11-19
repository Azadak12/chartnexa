import {
  auditEventSchema,
  staffOrderPageSchema,
  type AuditEvent,
  type OrderStatus,
  type StaffOrder,
} from "@chartnexa/api-contracts";
import { z } from "zod";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "../auth/authed-fetch";

const auditPageSchema = z.object({
  items: z.array(auditEventSchema),
  nextCursor: z.string().nullable(),
});

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}
const query = (params: Record<string, string | undefined>) => {
  const q = Object.entries(params)
    .filter((e): e is [string, string] => !!e[1])
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return q ? `?${q}` : "";
};

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const opsApi = {
  /** Audit records, newest first (Admins only; the server checks). */
  async audit(f: {
    outcome?: "success" | "denied" | undefined;
    action?: string | undefined;
    cursor?: string | undefined;
  }): Promise<Page<AuditEvent>> {
    return check(
      auditPageSchema,
      await authedFetch(
        `/staff/audit-events${query({ outcome: f.outcome, action: f.action, cursor: f.cursor, limit: "25" })}`,
      ),
    );
  },
  /** Every order's status, newest first (Admins and Managers; no card or payout data). */
  async orders(f: {
    status?: OrderStatus | undefined;
    cursor?: string | undefined;
  }): Promise<Page<StaffOrder>> {
    return check(
      staffOrderPageSchema,
      await authedFetch(
        `/staff/orders${query({ status: f.status, cursor: f.cursor, limit: "25" })}`,
      ),
    );
  },
};

/** "dispute won" from "review.hide": the action in words, as far as its name allows. */
export const actionText = (action: string): string => action.replace(/[._]/g, " ");

export const shortId = (id: string | null): string => (id ? id.slice(0, 8) : "none");
