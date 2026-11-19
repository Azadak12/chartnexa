import { Readable } from "node:stream";
import type { PrismaService } from "../../database/prisma.service.js";
import type { ObjectStorage } from "./storage.js";

const SAFE_KEY = /^[a-z0-9][a-z0-9/_-]{0,200}$/;
/** Bytes fetched per query when streaming, so a large file never sits in memory whole. */
const CHUNK = 1024 * 1024;

async function* slices(
  db: PrismaService,
  k: string,
  start: number,
  endInclusive: number,
): AsyncGenerator<Buffer> {
  for (let at = start; at <= endInclusive; at += CHUNK) {
    const len = Math.min(CHUNK, endInclusive - at + 1);
    const rows = await db.$queryRaw<Array<{ part: Buffer }>>`
      SELECT substring(data FROM ${at + 1}::int FOR ${len}::int) AS part
      FROM storage_objects WHERE key = ${k}`;
    const part = rows[0]?.part;
    if (!part || part.length === 0) return;
    yield Buffer.from(part);
    if (part.length < len) return;
  }
}

/**
 * Hosted storage for pilot use: file bytes live in the managed PostgreSQL database (table
 * storage_objects). They are never public: every read goes through the API's signed links and
 * permission checks, the same as the local-disk driver. Not meant for a large video catalogue:
 * database size and the 1 GB column limit apply (decision Q32 covers a real object store).
 */
export class PostgresStorage implements ObjectStorage {
  constructor(private readonly db: PrismaService) {}

  private key(key: string): string {
    if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error("invalid storage key");
    return key;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const k = this.key(key);
    await this.db.$executeRaw`
      INSERT INTO storage_objects (key, data, size_bytes, modified_at)
      VALUES (${k}, ${data}, ${data.length}, now())
      ON CONFLICT (key) DO UPDATE
        SET data = EXCLUDED.data, size_bytes = EXCLUDED.size_bytes, modified_at = now()`;
  }

  read(key: string): Readable {
    const k = this.key(key);
    const db = this.db;
    // Size is looked up lazily so a missing object is an error on the stream, like a missing file.
    async function* whole(): AsyncGenerator<Buffer> {
      const rows = await db.$queryRaw<Array<{ n: bigint }>>`
        SELECT size_bytes AS n FROM storage_objects WHERE key = ${k}`;
      const n = rows[0] ? Number(rows[0].n) : null;
      if (n === null) throw Object.assign(new Error("not found"), { code: "ENOENT" });
      if (n === 0) return;
      yield* slices(db, k, 0, n - 1);
    }
    return Readable.from(whole());
  }

  readRange(key: string, start: number, end: number): Readable {
    return Readable.from(slices(this.db, this.key(key), start, end));
  }

  async compose(keys: string[], dest: string): Promise<void> {
    const d = this.key(dest);
    const parts = keys.map((k) => this.key(k));
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM storage_objects WHERE key = ${d}`;
      await tx.$executeRaw`
        INSERT INTO storage_objects (key, data, size_bytes) VALUES (${d}, ''::bytea, 0)`;
      for (const p of parts) {
        const n = await tx.$executeRaw`
          UPDATE storage_objects t
          SET data = t.data || s.data, size_bytes = t.size_bytes + s.size_bytes, modified_at = now()
          FROM storage_objects s WHERE t.key = ${d} AND s.key = ${p}`;
        if (n !== 1) throw new Error("missing part");
      }
    });
  }

  async size(key: string): Promise<number | null> {
    const rows = await this.db.$queryRaw<Array<{ n: bigint }>>`
      SELECT size_bytes AS n FROM storage_objects WHERE key = ${this.key(key)}`;
    return rows[0] ? Number(rows[0].n) : null;
  }

  async delete(key: string): Promise<void> {
    const k = this.key(key);
    // Like the disk driver, deleting a prefix removes everything below it.
    await this.db.$executeRaw`
      DELETE FROM storage_objects WHERE key = ${k} OR starts_with(key, ${k + "/"})`;
  }

  async list(prefix: string): Promise<{ key: string; modifiedAt: Date }[]> {
    const p = this.key(prefix);
    const rows = await this.db.$queryRaw<Array<{ key: string; modified_at: Date }>>`
      SELECT key, modified_at FROM storage_objects
      WHERE key = ${p} OR starts_with(key, ${p.endsWith("/") ? p : p + "/"})`;
    return rows.map((r) => ({ key: r.key, modifiedAt: r.modified_at }));
  }
}
