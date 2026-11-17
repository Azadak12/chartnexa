import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { PrismaService } from "../src/database/prisma.service.js";
import { startApp, type TestApp } from "./support.js";

let t: TestApp;
let db: PrismaService;
beforeAll(async () => {
  t = await startApp({ DATABASE_URL: inject("dbUrl") });
  db = t.app.get(PrismaService);
});
afterAll(async () => {
  await t.app.close();
});

describe("database session", () => {
  it("uses UTC so JavaScript dates and database time agree whatever the server zone is", async () => {
    const zone = await db.$queryRaw<{ tz: string }[]>`SELECT current_setting('timezone') AS tz`;
    expect(zone[0]?.tz).toBe("UTC");
    const js = new Date();
    const rows = await db.$queryRaw<{ diff: number }[]>`
      SELECT abs(extract(epoch from (${js}::timestamptz - now())))::float AS diff`;
    expect(rows[0]?.diff).toBeLessThan(5);
  });
});
