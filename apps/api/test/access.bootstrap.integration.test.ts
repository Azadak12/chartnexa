import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runBootstrap } from "../src/cli/admin-bootstrap.js";
import { person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let dbUrl: string;
let drop: () => Promise<void>;
beforeAll(async () => {
  const db = await createIsolatedDb();
  dbUrl = db.url;
  drop = db.drop;
  h = await makeHarness(db.url);
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});
beforeEach(async () => {
  await h.db.userRole.updateMany({
    where: { role: "admin", revokedAt: null },
    data: { revokedAt: new Date() },
  });
});

const env = () => ({
  DATABASE_URL: dbUrl,
  CURSOR_SECRET: "c".repeat(32),
  ACCESS_TOKEN_SECRET: "a".repeat(32),
  MAILER_DRIVER: "memory",
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
});
const run = (p: Person, ...flags: string[]) =>
  runBootstrap(["--email", p.email.toLowerCase(), ...flags], env());
const adminRows = (h: Harness) =>
  h.db.userRole.findMany({ where: { role: "admin", revokedAt: null } });

describe("first-Admin bootstrap", () => {
  it("makes a verified account the first Admin with a system audit record", async () => {
    const p = await person(h);
    const r = await run(p);
    expect(r).toMatchObject({ exitCode: 0 });
    expect((await adminRows(h)).map((x) => x.userId)).toEqual([p.id]);
    const audit = await h.db.auditEvent.findFirstOrThrow({
      where: { targetId: p.id, action: "role.bootstrap" },
    });
    expect(audit).toMatchObject({
      actorKind: "system",
      actorUserId: null,
      outcome: "success",
      reason: "bootstrap",
      after: { role: "admin" },
    });
  });

  it("refuses when an Admin already exists and changes nothing", async () => {
    const first = await person(h);
    await run(first);
    const second = await person(h);
    const r = await run(second);
    expect(r.exitCode).toBe(1);
    expect(r.message).toMatch(/already exists/i);
    expect((await adminRows(h)).map((x) => x.userId)).toEqual([first.id]);
  });

  it("recovers with --recovery and marks the audit record", async () => {
    const locked = await person(h, "admin");
    const rescuer = await person(h);
    const r = await run(rescuer, "--recovery");
    expect(r.exitCode).toBe(0);
    // Recovery adds an Admin; it does not remove the locked-out one (an operator can revoke later).
    expect((await adminRows(h)).map((x) => x.userId).sort()).toEqual(
      [locked.id, rescuer.id].sort(),
    );
    const audit = await h.db.auditEvent.findFirstOrThrow({
      where: { targetId: rescuer.id, action: "role.recovery" },
    });
    expect(audit).toMatchObject({ actorKind: "system", reason: "recovery" });
    expect(locked.id).not.toBe(rescuer.id);
  });

  it("refuses unknown, unverified and disabled accounts", async () => {
    const unverified = await person(h, undefined, false);
    const disabled = await person(h);
    await h.db.user.update({ where: { id: disabled.id }, data: { status: "disabled" } });
    for (const p of [unverified, disabled]) {
      expect((await run(p)).exitCode).toBe(1);
    }
    expect((await runBootstrap(["--email", "nobody@example.com"], env())).exitCode).toBe(1);
    expect(await adminRows(h)).toHaveLength(0);
  });

  it("validates arguments and prints no secrets", async () => {
    expect((await runBootstrap([], env())).exitCode).toBe(1);
    expect((await runBootstrap(["--email", "a@b.co", "--bogus"], env())).exitCode).toBe(1);
    const p = await person(h);
    const r = await run(p);
    for (const secret of [
      p.password,
      p.email,
      p.accessToken,
      p.refreshToken,
      "argon2",
      "a".repeat(32),
    ]) {
      expect(r.message).not.toContain(secret);
    }
  });

  it("works as the real command with exit codes", async () => {
    const p = await person(h);
    const cmd = (extra: string[]) =>
      spawnSync(
        "pnpm",
        [
          "exec",
          "tsx",
          "scripts/admin-bootstrap.ts",
          "--",
          "--email",
          p.email.toLowerCase(),
          ...extra,
        ],
        {
          env: { ...process.env, ...env() },
          encoding: "utf8",
        },
      );
    const ok = cmd([]);
    expect(ok.status, `${ok.stderr}${ok.stdout}`).toBe(0);
    expect(ok.stdout).toContain(p.id);
    const again = cmd([]);
    expect(again.status).toBe(0); // already an Admin: idempotent
    const other = await person(h);
    const refused = spawnSync(
      "pnpm",
      ["exec", "tsx", "scripts/admin-bootstrap.ts", "--", "--email", other.email.toLowerCase()],
      {
        env: { ...process.env, ...env() },
        encoding: "utf8",
      },
    );
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/already exists/i);
  }, 60_000);
});
