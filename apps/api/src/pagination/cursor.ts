import { BadRequestException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type Page } from "@chartnexa/api-contracts";

export const pageParamsSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().max(512).optional(),
});
export type PageParams = z.infer<typeof pageParamsSchema>;

export class InvalidCursorException extends BadRequestException {
  constructor() {
    super("Invalid cursor.");
  }
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** Opaque, tamper-evident cursor: base64url(json).signature */
export function encodeCursor(key: readonly (string | number)[], secret: string): string {
  const body = Buffer.from(JSON.stringify(key)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function decodeCursor(cursor: string, secret: string): (string | number)[] {
  const [body, sig, extra] = cursor.split(".");
  if (!body || !sig || extra !== undefined) throw new InvalidCursorException();
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new InvalidCursorException();
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString());
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((v) => typeof v === "string" || typeof v === "number")
    ) {
      return parsed as (string | number)[];
    }
  } catch {
    // fall through
  }
  throw new InvalidCursorException();
}

/**
 * Turns `limit + 1` fetched rows (ordered by a stable total key) into a page.
 * Callers must query with a keyset condition `(sort_key, id) > cursor`, never OFFSET.
 */
export function buildPage<T>(
  rows: T[],
  limit: number,
  keyOf: (row: T) => readonly (string | number)[],
  secret: string,
): Page<T> {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const hasMore = rows.length > limit && last !== undefined;
  return { items, nextCursor: hasMore ? encodeCursor(keyOf(last), secret) : null };
}
