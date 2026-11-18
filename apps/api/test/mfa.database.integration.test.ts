import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

const challenge = (userId: string, over: Record<string, unknown> = {}) => ({
  userId,
  kind: "verify",
  tokenHash: `hash-${Math.random().toString(36).slice(2)}`,
  expiresAt: new Date(Date.now() + 300_000),
  ...over,
});
const sealed = { pendingCiphertext: "c", pendingIv: "i", pendingTag: "t" };

describe("the database keeps two-step data honest on its own", () => {
  it("allows one unused challenge per person and kind, and a new one once the old is used", async () => {
    const p = await person(h);
    const first = await h.db.mfaChallenge.create({ data: challenge(p.id) });
    await expect(h.db.mfaChallenge.create({ data: challenge(p.id) })).rejects.toThrow();
    await h.db.mfaChallenge.create({ data: challenge(p.id, { kind: "setup" }) });
    await h.db.mfaChallenge.update({ where: { id: first.id }, data: { usedAt: new Date() } });
    await h.db.mfaChallenge.create({ data: challenge(p.id) });
  });

  it("refuses an unknown kind, attempts out of range, a repeated token hash and an orphan", async () => {
    const p = await person(h);
    await expect(
      h.db.mfaChallenge.create({ data: challenge(p.id, { kind: "other" }) }),
    ).rejects.toThrow();
    await expect(
      h.db.mfaChallenge.create({ data: challenge(p.id, { attempts: 11 }) }),
    ).rejects.toThrow();
    await expect(
      h.db.mfaChallenge.create({ data: challenge(p.id, { attempts: -1 }) }),
    ).rejects.toThrow();
    await h.db.mfaChallenge.create({ data: challenge(p.id, { tokenHash: "same-hash" }) });
    const q = await person(h);
    await expect(
      h.db.mfaChallenge.create({ data: challenge(q.id, { tokenHash: "same-hash" }) }),
    ).rejects.toThrow();
    await expect(
      h.db.mfaChallenge.create({ data: challenge("00000000-0000-4000-8000-000000000000") }),
    ).rejects.toThrow();
  });

  it("keeps a pending secret whole and only on a setup challenge", async () => {
    const p = await person(h);
    await expect(
      h.db.mfaChallenge.create({
        data: challenge(p.id, { kind: "setup", pendingCiphertext: "c" }),
      }),
    ).rejects.toThrow();
    await expect(
      h.db.mfaChallenge.create({ data: challenge(p.id, { ...sealed }) }),
    ).rejects.toThrow();
    await h.db.mfaChallenge.create({ data: challenge(p.id, { kind: "setup", ...sealed }) });
  });

  it("allows one credential per person, no negative step, and unique recovery codes per person", async () => {
    const p = await person(h);
    const cred = { userId: p.id, secretCiphertext: "c", secretIv: "i", secretTag: "t" };
    await h.db.mfaCredential.create({ data: cred });
    await expect(h.db.mfaCredential.create({ data: cred })).rejects.toThrow();
    const q = await person(h);
    await expect(
      h.db.mfaCredential.create({ data: { ...cred, userId: q.id, lastUsedStep: -1n } }),
    ).rejects.toThrow();
    await h.db.mfaRecoveryCode.create({ data: { userId: p.id, codeHash: "h1" } });
    await expect(
      h.db.mfaRecoveryCode.create({ data: { userId: p.id, codeHash: "h1" } }),
    ).rejects.toThrow();
    await h.db.mfaRecoveryCode.create({ data: { userId: q.id, codeHash: "h1" } });
  });
});

describe("the rollout step", () => {
  it("ends the sessions of current Admins and Managers only", async () => {
    // The statement is part of the migration; run the same SQL against fresh data to prove it.
    const admin = await person(h, "admin");
    const manager = await person(h, "manager");
    const instructor = await person(h, "instructor");
    const student = await person(h);
    await h.db
      .$executeRawUnsafe(`UPDATE "sessions" SET "revoked_at" = CURRENT_TIMESTAMP, "revoked_reason" = 'mfa_rollout'
      WHERE "revoked_at" IS NULL AND "user_id" IN (
        SELECT "user_id" FROM "user_roles" WHERE "revoked_at" IS NULL AND "role" IN ('admin','manager'))`);
    const revoked = async (id: string) =>
      (await h.db.session.findMany({ where: { userId: id } })).map((s) => s.revokedAt !== null);
    expect(await revoked(admin.id)).toEqual([true]);
    expect(await revoked(manager.id)).toEqual([true]);
    expect(await revoked(instructor.id)).toEqual([false]);
    expect(await revoked(student.id)).toEqual([false]);
  });
});
