import { describe, expect, it } from "vitest";
import {
  buildPage,
  decodeCursor,
  encodeCursor,
  InvalidCursorException,
  pageParamsSchema,
} from "./cursor.js";

const SECRET = "k".repeat(32);

type Row = { sort: number; id: number };
const keyOf = (r: Row) => [r.sort, r.id] as const;
const cmp = (a: Row, b: Row) => a.sort - b.sort || a.id - b.id;

function fetchAfter(table: Row[], cursor: string | undefined, limit: number): Row[] {
  const after = cursor ? decodeCursor(cursor, SECRET) : undefined;
  return [...table]
    .sort(cmp)
    .filter((r: Row) => !after || cmp(r, { sort: after[0] as number, id: after[1] as number }) > 0)
    .slice(0, limit + 1);
}

describe("cursor", () => {
  it("round-trips", () => {
    expect(decodeCursor(encodeCursor([5, 9], SECRET), SECRET)).toEqual([5, 9]);
  });
  it("rejects tampered, malformed and wrong-secret cursors", () => {
    const good = encodeCursor([5, 9], SECRET);
    const body = good.split(".")[0] as string;
    const forged = `${Buffer.from("[1,1]").toString("base64url")}.${good.split(".")[1]}`;
    for (const bad of ["", "abc", `${body}.x`, forged, `${good}.extra`]) {
      expect(() => decodeCursor(bad, SECRET)).toThrow(InvalidCursorException);
    }
    expect(() => decodeCursor(good, "z".repeat(32))).toThrow(InvalidCursorException);
  });
});

describe("pageParamsSchema", () => {
  it("defaults and caps the page size", () => {
    expect(pageParamsSchema.parse({}).limit).toBe(25);
    expect(pageParamsSchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(pageParamsSchema.safeParse({ limit: "0" }).success).toBe(false);
  });
});

describe("buildPage", () => {
  it("pages stably while rows are inserted between requests", () => {
    const table: Row[] = Array.from({ length: 10 }, (_, i) => ({ sort: i * 10, id: i }));
    const original = new Set(table.map((r: Row) => r.id));
    const seen: number[] = [];
    let cursor: string | undefined;
    let step = 0;
    do {
      const page = buildPage(fetchAfter(table, cursor, 3), 3, keyOf, SECRET);
      seen.push(...page.items.map((r: Row) => r.id));
      cursor = page.nextCursor ?? undefined;
      // concurrent inserts: one behind the cursor, one ahead
      table.push({ sort: step, id: 100 + step }, { sort: 1000 + step, id: 200 + step });
      step++;
    } while (cursor);
    const originalSeen = seen.filter((id) => original.has(id));
    expect(originalSeen).toEqual([...original]);
    expect(new Set(seen).size).toBe(seen.length);
  });
});
