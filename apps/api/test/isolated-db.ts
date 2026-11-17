import { createScratchDb, migrateDeploy } from "../scripts/lib/scratch-db.js";

/** A private migrated database for tests that count Admins or must not see other files' data. */
export async function createIsolatedDb(): Promise<{ url: string; drop: () => Promise<void> }> {
  const db = await createScratchDb();
  migrateDeploy(db.url);
  return db;
}
