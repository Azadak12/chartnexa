import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { createScratchDb, migrateDeploy } from "./lib/scratch-db.js";

const migrationsDir = join(import.meta.dirname, "..", "prisma", "migrations");
const dirs = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const d of dirs) {
  if (!existsSync(join(migrationsDir, d, "down.sql"))) {
    throw new Error(`Migration ${d} has no down.sql`);
  }
}
if (dirs.length === 0) throw new Error("No migrations found");

const SNAPSHOT_SQL = `
  SELECT 'column:' || table_name || '.' || column_name || ':' || data_type || ':' || is_nullable AS item
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
  UNION ALL
  SELECT 'index:' || indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  UNION ALL
  SELECT 'enum:' || t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e'
  ORDER BY 1`;

const db = await createScratchDb();
const client = new pg.Client({ connectionString: db.url });
const snapshot = async (): Promise<string[]> =>
  (await client.query(SNAPSHOT_SQL)).rows.map((r: { item: string }) => r.item);

try {
  migrateDeploy(db.url);
  await client.connect();
  const full = await snapshot();
  if (full.length === 0) throw new Error("up: schema is empty after apply");

  const again = migrateDeploy(db.url);
  if (!/No pending migrations/i.test(again)) throw new Error("re-apply was not a no-op");

  // Roll back every migration, newest first; each step must change the schema.
  let previous = full;
  for (const name of [...dirs].reverse()) {
    const down = readFileSync(join(migrationsDir, name, "down.sql"), "utf8");
    await client.query("BEGIN");
    await client.query(down);
    await client.query(`DELETE FROM "_prisma_migrations" WHERE migration_name = $1`, [name]);
    await client.query("COMMIT");
    const now = await snapshot();
    if (JSON.stringify(now) === JSON.stringify(previous)) {
      throw new Error(`down: ${name} did not change the schema`);
    }
    previous = now;
  }
  if (previous.length !== 0) {
    throw new Error(`down: schema not empty after rolling back everything: ${previous.join(", ")}`);
  }

  migrateDeploy(db.url);
  const reup = await snapshot();
  if (JSON.stringify(reup) !== JSON.stringify(full)) {
    throw new Error("re-up: schema differs from the original full apply");
  }
  console.log(`migration round trip OK (${dirs.length} migrations: up, no-op, down all, up)`);
} finally {
  await client.end().catch(() => undefined);
  await db.drop();
}
