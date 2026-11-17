import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { userInfo } from "node:os";
import pg from "pg";

export const DEFAULT_ADMIN_URL = `postgresql://${userInfo().username}@localhost:5432/postgres`;

export interface ScratchDb {
  url: string;
  drop: () => Promise<void>;
}

/** Creates a uniquely named empty database and returns its URL plus a drop function. */
export async function createScratchDb(
  adminUrl = process.env["TEST_DATABASE_ADMIN_URL"] ?? DEFAULT_ADMIN_URL,
): Promise<ScratchDb> {
  const name = `chartnexa_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  const u = new URL(adminUrl);
  u.pathname = `/${name}`;
  return {
    url: u.toString(),
    drop: async () => {
      const c = new pg.Client({ connectionString: adminUrl });
      await c.connect();
      try {
        await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await c.end();
      }
    },
  };
}

export function migrateDeploy(databaseUrl: string): string {
  const r = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`migrate deploy failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}
