import type { TestProject } from "vitest/node";
import { createScratchDb, migrateDeploy } from "../scripts/lib/scratch-db.js";

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const db = await createScratchDb();
  migrateDeploy(db.url);
  project.provide("dbUrl", db.url);
  return async () => {
    await db.drop();
  };
}
