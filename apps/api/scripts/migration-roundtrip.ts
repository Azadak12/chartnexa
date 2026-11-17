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
const latest = dirs[dirs.length - 1];
if (!latest) throw new Error("No migrations found");

const db = await createScratchDb();
const client = new pg.Client({ connectionString: db.url });
const tableExists = async (): Promise<boolean> =>
  (await client.query(`SELECT to_regclass('public.schema_baseline') AS t`)).rows[0].t !== null;

try {
  migrateDeploy(db.url);
  await client.connect();
  if (!(await tableExists())) throw new Error("up: schema_baseline missing after apply");

  const again = migrateDeploy(db.url);
  if (!/No pending migrations/i.test(again)) throw new Error("re-apply was not a no-op");

  const down = readFileSync(join(migrationsDir, latest, "down.sql"), "utf8");
  await client.query("BEGIN");
  await client.query(down);
  await client.query(`DELETE FROM "_prisma_migrations" WHERE migration_name = $1`, [latest]);
  await client.query("COMMIT");
  if (await tableExists()) throw new Error("down: schema_baseline still present after rollback");

  migrateDeploy(db.url);
  if (!(await tableExists())) throw new Error("re-up: schema_baseline missing after re-apply");
  console.log(`migration round trip OK (${latest}: up, no-op, down, up)`);
} finally {
  await client.end().catch(() => undefined);
  await db.drop();
}
