import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { MfaChallenge, MfaSetupStartResponse, MfaStatus } from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { AuditService } from "../access/index.js";
import {
  hashToken,
  logEvent,
  newOpaqueToken,
  PasswordService,
  type MfaGate,
  type RequestCtx,
} from "../identity/index.js";
import { RateLimiterService } from "../rate-limit/index.js";
import {
  hashRecoveryCode,
  newRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "./recovery-codes.js";
import { DEV_MFA_KEY, open, parseKey, seal, type Sealed } from "./secret-box.js";
import { matchStep, newSecret, otpauthUri } from "./totp.js";

type Tx = Prisma.TransactionClient;

/** One message for every failure of the second step: wrong, expired, used, unknown or burned. */
const failed = () =>
  new UnauthorizedException("That code did not work. Sign in again to get a new one.");
/** Thrown inside a transaction to undo it when a code was already used. */
class Replay extends Error {}

const STAFF_ROLES = ["admin", "manager"] as const;

export interface VerifiedSecondStep {
  userId: string;
  /** Set only when a recovery code was used. */
  recoveryCodesRemaining: number | null;
}

@Injectable()
export class MfaService implements MfaGate {
  private readonly key: Buffer;

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(RateLimiterService) private readonly limiter: RateLimiterService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {
    this.key = parseKey(config.MFA_ENCRYPTION_KEY ?? DEV_MFA_KEY) as Buffer;
  }

  // --- who needs it --------------------------------------------------------------------------

  /** Admins and Managers need a second step. Read from the database at sign-in time. */
  async isStaffNeedingMfa(userId: string): Promise<boolean> {
    const role = await this.db.userRole.findFirst({
      where: { userId, revokedAt: null, role: { in: [...STAFF_ROLES] } },
      select: { id: true },
    });
    return role !== null;
  }

  /** Called after a correct password. Returns a challenge, or null for people who sign in as usual. */
  async challengeFor(userId: string, ctx: RequestCtx): Promise<MfaChallenge | null> {
    if (!(await this.isStaffNeedingMfa(userId))) return null;
    const enrolled = (await this.db.mfaCredential.findUnique({ where: { userId } })) !== null;
    const kind = enrolled ? "verify" : "setup";
    const token = newOpaqueToken();
    const ttl = this.config.MFA_CHALLENGE_TTL_SECONDS;
    await this.db.$transaction(async (tx) => {
      // A new sign-in replaces any earlier unused challenge.
      await tx.mfaChallenge.deleteMany({ where: { userId, usedAt: null } });
      await tx.mfaChallenge.create({
        data: {
          userId,
          kind,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + ttl * 1000),
        },
      });
    });
    logEvent(ctx, "auth.mfa.challenge", { userId, outcome: kind });
    return {
      status: enrolled ? "mfa_required" : "mfa_setup_required",
      challengeToken: token,
      expiresInSeconds: ttl,
    };
  }

  // --- challenge handling --------------------------------------------------------------------

  private async findOpen(token: string, kind: "verify" | "setup") {
    const row = await this.db.mfaChallenge.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.kind !== kind || row.usedAt || row.expiresAt <= new Date()) throw failed();
    return row;
  }

  /**
   * Counts this try against the challenge and the person before the code is looked at, so a
   * guesser gains nothing from sending many at once. Returns the challenge and its attempt number.
   */
  private async startAttempt(token: string, kind: "verify" | "setup", ctx: RequestCtx) {
    const ipKey = `mfa:ip:${ctx.ip}`;
    await this.limiter.assertBelow(
      ipKey,
      this.config.RL_LOGIN_IP_MAX,
      this.config.RL_LOGIN_WINDOW_SECONDS,
    );
    const row = await this.findOpen(token, kind);
    await this.limiter.assertBelow(
      `mfa:user:${row.userId}`,
      this.config.RL_MFA_USER_MAX,
      this.config.RL_MFA_WINDOW_SECONDS,
    );
    const bumped = await this.db.$queryRaw<{ attempts: number }[]>`
      UPDATE mfa_challenges SET attempts = attempts + 1
      WHERE id = ${row.id}::uuid AND used_at IS NULL AND attempts < ${this.config.MFA_MAX_ATTEMPTS}
      RETURNING attempts`;
    if (bumped.length === 0) throw failed();
    return { row, attempts: bumped[0]!.attempts };
  }

  /** A wrong code: counted against the person and the address, and the challenge dies on the last try. */
  private async reject(
    row: { id: string; userId: string },
    attempts: number,
    ctx: RequestCtx,
  ): Promise<never> {
    await Promise.all([
      this.limiter.hit(`mfa:user:${row.userId}`, this.config.RL_MFA_WINDOW_SECONDS),
      this.limiter.hit(`mfa:ip:${ctx.ip}`, this.config.RL_LOGIN_WINDOW_SECONDS),
    ]);
    if (attempts >= this.config.MFA_MAX_ATTEMPTS) {
      await this.db.mfaChallenge.deleteMany({ where: { id: row.id, usedAt: null } });
    }
    logEvent(ctx, "auth.mfa.failure", { userId: row.userId, outcome: "wrong_code" });
    throw failed();
  }

  private async assertActive(tx: Tx, userId: string): Promise<void> {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (user?.status !== "active") throw failed();
  }

  private async markChallengeUsed(tx: Tx, id: string): Promise<void> {
    const used = await tx.$queryRaw<{ id: string }[]>`
      UPDATE mfa_challenges SET used_at = now() WHERE id = ${id}::uuid AND used_at IS NULL RETURNING id`;
    if (used.length === 0) throw failed();
  }

  /** Accepts a step only if it is newer than the last accepted one, even when requests race. */
  private async claimStep(tx: Tx, userId: string, step: number): Promise<void> {
    const claimed = await tx.$queryRaw<{ user_id: string }[]>`
      UPDATE mfa_credentials SET last_used_step = ${step}
      WHERE user_id = ${userId}::uuid AND last_used_step < ${step} RETURNING user_id`;
    if (claimed.length === 0) throw new Replay();
  }

  private newCodes(): { shown: string[]; hashes: string[] } {
    const shown = Array.from({ length: RECOVERY_CODE_COUNT }, () => newRecoveryCode());
    return {
      shown,
      hashes: shown.map((c) => hashRecoveryCode(normalizeRecoveryCode(c) as string)),
    };
  }

  private async storeCodes(tx: Tx, userId: string, hashes: string[]): Promise<void> {
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.mfaRecoveryCode.createMany({ data: hashes.map((codeHash) => ({ userId, codeHash })) });
  }

  // --- the second step at sign-in ------------------------------------------------------------

  /** A 6-digit authenticator code or a recovery code. Returns who passed; the caller issues tokens. */
  async verify(token: string, rawCode: string, ctx: RequestCtx): Promise<VerifiedSecondStep> {
    const { row, attempts } = await this.startAttempt(token, "verify", ctx);
    const code = rawCode.replace(/\s+/g, "");
    const recovery = /^\d{6}$/.test(code) ? null : normalizeRecoveryCode(rawCode);
    if (!/^\d{6}$/.test(code) && recovery === null) return this.reject(row, attempts, ctx);

    if (recovery !== null) return this.verifyRecovery(row, attempts, recovery, ctx);

    const credential = await this.db.mfaCredential.findUnique({ where: { userId: row.userId } });
    if (!credential) return this.reject(row, attempts, ctx);
    const secret = open(
      {
        ciphertext: credential.secretCiphertext,
        iv: credential.secretIv,
        tag: credential.secretTag,
      },
      this.key,
    );
    const step = matchStep(secret, code, Date.now());
    if (step === null) return this.reject(row, attempts, ctx);
    try {
      await this.db.$transaction(async (tx) => {
        await this.markChallengeUsed(tx, row.id);
        await this.claimStep(tx, row.userId, step);
        await this.assertActive(tx, row.userId);
      });
    } catch (e) {
      if (e instanceof Replay) return this.reject(row, attempts, ctx);
      throw e;
    }
    logEvent(ctx, "auth.mfa.success", { userId: row.userId, outcome: "totp" });
    return { userId: row.userId, recoveryCodesRemaining: null };
  }

  private async verifyRecovery(
    row: { id: string; userId: string },
    attempts: number,
    normalized: string,
    ctx: RequestCtx,
  ): Promise<VerifiedSecondStep> {
    let remaining = 0;
    try {
      await this.db.$transaction(async (tx) => {
        const known = await tx.mfaRecoveryCode.findUnique({
          where: {
            userId_codeHash: { userId: row.userId, codeHash: hashRecoveryCode(normalized) },
          },
          select: { id: true },
        });
        if (!known) throw new Replay();
        // One winner when the same code arrives twice at once.
        const used = await tx.$queryRaw<{ id: string }[]>`
          UPDATE mfa_recovery_codes SET used_at = now()
          WHERE id = ${known.id}::uuid AND used_at IS NULL RETURNING id`;
        if (used.length === 0) throw new Replay();
        await this.markChallengeUsed(tx, row.id);
        await this.assertActive(tx, row.userId);
        remaining = await tx.mfaRecoveryCode.count({ where: { userId: row.userId, usedAt: null } });
        await this.audit.record(tx, {
          actorKind: "user",
          actorUserId: row.userId,
          action: "mfa.recovery_used",
          targetType: "user",
          targetId: row.userId,
          outcome: "success",
          after: { remaining },
        });
      });
    } catch (e) {
      if (e instanceof Replay) return this.reject(row, attempts, ctx);
      throw e;
    }
    logEvent(ctx, "auth.mfa.success", { userId: row.userId, outcome: "recovery_code" });
    return { userId: row.userId, recoveryCodesRemaining: remaining };
  }

  // --- enrollment ----------------------------------------------------------------------------

  /** Makes a secret for the setup challenge and returns it once. Nothing is enabled yet. */
  async startSetup(token: string): Promise<MfaSetupStartResponse> {
    const row = await this.findOpen(token, "setup");
    if (await this.db.mfaCredential.findUnique({ where: { userId: row.userId } })) {
      throw new ConflictException("Two-step sign-in is already set up for this account.");
    }
    const user = await this.db.user.findUnique({
      where: { id: row.userId },
      select: { email: true },
    });
    const accountName = user?.email ?? row.userId;
    const secret = newSecret();
    const sealed = seal(secret, this.key);
    const stored = await this.db.mfaChallenge.updateMany({
      where: { id: row.id, usedAt: null },
      data: { pendingCiphertext: sealed.ciphertext, pendingIv: sealed.iv, pendingTag: sealed.tag },
    });
    if (stored.count === 0) throw failed();
    return { secret, otpauthUri: otpauthUri(secret, accountName), accountName };
  }

  /** Proves the first code, turns two-step sign-in on and returns the recovery codes once. */
  async completeSetup(
    token: string,
    rawCode: string,
    ctx: RequestCtx,
  ): Promise<{ userId: string; recoveryCodes: string[] }> {
    const { row, attempts } = await this.startAttempt(token, "setup", ctx);
    const full = await this.db.mfaChallenge.findUnique({ where: { id: row.id } });
    if (!full?.pendingCiphertext || !full.pendingIv || !full.pendingTag) {
      return this.reject(row, attempts, ctx);
    }
    const secret = open(
      { ciphertext: full.pendingCiphertext, iv: full.pendingIv, tag: full.pendingTag },
      this.key,
    );
    const step = matchStep(secret, rawCode.replace(/\s+/g, ""), Date.now());
    if (step === null) return this.reject(row, attempts, ctx);

    const codes = this.newCodes();
    const sealed: Sealed = seal(secret, this.key);
    try {
      await this.db.$transaction(async (tx) => {
        await this.markChallengeUsed(tx, row.id);
        await this.assertActive(tx, row.userId);
        if (await tx.mfaCredential.findUnique({ where: { userId: row.userId } })) {
          throw new ConflictException("Two-step sign-in is already set up for this account.");
        }
        await tx.mfaCredential.create({
          data: {
            userId: row.userId,
            secretCiphertext: sealed.ciphertext,
            secretIv: sealed.iv,
            secretTag: sealed.tag,
            lastUsedStep: BigInt(step),
          },
        });
        await this.storeCodes(tx, row.userId, codes.hashes);
        await this.audit.record(tx, {
          actorKind: "user",
          actorUserId: row.userId,
          action: "mfa.enroll",
          targetType: "user",
          targetId: row.userId,
          outcome: "success",
          after: { recoveryCodes: RECOVERY_CODE_COUNT },
        });
      });
    } catch (e) {
      if (e instanceof Replay) return this.reject(row, attempts, ctx);
      throw e;
    }
    logEvent(ctx, "auth.mfa.enrolled", { userId: row.userId, outcome: "ok" });
    return { userId: row.userId, recoveryCodes: codes.shown };
  }

  // --- managing it when signed in ------------------------------------------------------------

  async status(userId: string): Promise<MfaStatus> {
    const [required, credential, remaining] = await Promise.all([
      this.isStaffNeedingMfa(userId),
      this.db.mfaCredential.findUnique({ where: { userId }, select: { userId: true } }),
      this.db.mfaRecoveryCode.count({ where: { userId, usedAt: null } }),
    ]);
    return { required, enabled: credential !== null, recoveryCodesRemaining: remaining };
  }

  /** New recovery codes, only with the password and a current authenticator code. */
  async regenerate(
    userId: string,
    password: string,
    rawCode: string,
    ctx: RequestCtx,
  ): Promise<string[]> {
    await this.limiter.assertBelow(
      `mfa:user:${userId}`,
      this.config.RL_MFA_USER_MAX,
      this.config.RL_MFA_WINDOW_SECONDS,
    );
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    const credential = await this.db.mfaCredential.findUnique({ where: { userId } });
    const passwordOk =
      user?.passwordHash != null
        ? await this.passwords.verify(password, user.passwordHash)
        : (await this.passwords.verifyDummy(password), false);
    const secret = credential
      ? open(
          {
            ciphertext: credential.secretCiphertext,
            iv: credential.secretIv,
            tag: credential.secretTag,
          },
          this.key,
        )
      : null;
    const step = secret ? matchStep(secret, rawCode.replace(/\s+/g, ""), Date.now()) : null;
    if (!passwordOk || step === null) {
      await this.limiter.hit(`mfa:user:${userId}`, this.config.RL_MFA_WINDOW_SECONDS);
      logEvent(ctx, "auth.mfa.regenerate_failure", { userId, outcome: "refused" });
      throw new UnauthorizedException("The password or code did not work.");
    }
    const codes = this.newCodes();
    try {
      await this.db.$transaction(async (tx) => {
        await this.claimStep(tx, userId, step);
        await this.storeCodes(tx, userId, codes.hashes);
        await this.audit.record(tx, {
          actorKind: "user",
          actorUserId: userId,
          action: "mfa.recovery_regenerate",
          targetType: "user",
          targetId: userId,
          outcome: "success",
          after: { recoveryCodes: RECOVERY_CODE_COUNT },
        });
      });
    } catch (e) {
      if (e instanceof Replay) {
        throw new UnauthorizedException("The password or code did not work.");
      }
      throw e;
    }
    return codes.shown;
  }

  // --- lost device ---------------------------------------------------------------------------

  /** Removes a person's second step and ends their sessions. Used by Admins and the operator. */
  private async wipe(tx: Tx, targetId: string, why: string): Promise<boolean> {
    const had = await tx.mfaCredential.findUnique({ where: { userId: targetId } });
    await tx.mfaChallenge.deleteMany({ where: { userId: targetId } });
    await tx.mfaRecoveryCode.deleteMany({ where: { userId: targetId } });
    await tx.mfaCredential.deleteMany({ where: { userId: targetId } });
    if (had) {
      await tx.session.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: why },
      });
    }
    return had !== null;
  }

  /** An Admin resets someone else's second step. Nobody resets their own. */
  async reset(
    actorId: string,
    targetId: string,
    reason: string,
    requestId: string,
  ): Promise<{ reset: boolean }> {
    if (actorId === targetId) {
      throw new ForbiddenException("You cannot reset your own two-step sign-in.");
    }
    return this.db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!target) throw new NotFoundException("Account not found.");
      const reset = await this.wipe(tx, targetId, "mfa_reset");
      if (reset) {
        await this.audit.record(tx, {
          actorKind: "user",
          actorUserId: actorId,
          action: "mfa.reset",
          targetType: "user",
          targetId,
          outcome: "success",
          reason,
          requestId,
        });
      }
      return { reset };
    });
  }

  /** The operator command: the person's email, an audited system action. */
  async resetForOperator(email: string): Promise<{ ok: boolean; message: string }> {
    const user = await this.db.user.findUnique({
      where: { emailNormalized: email.trim().toLowerCase() },
      select: { id: true },
    });
    if (!user) return { ok: false, message: "No account uses that email." };
    const reset = await this.db.$transaction(async (tx) => {
      const did = await this.wipe(tx, user.id, "mfa_reset");
      if (did) {
        await this.audit.record(tx, {
          actorKind: "system",
          action: "mfa.reset",
          targetType: "user",
          targetId: user.id,
          outcome: "success",
          reason: "operator_reset",
        });
      }
      return did;
    });
    return reset
      ? {
          ok: true,
          message: `Two-step sign-in was reset for account ${user.id}. They enroll again at next sign-in.`,
        }
      : { ok: true, message: `Account ${user.id} had no two-step sign-in to reset.` };
  }

  /** Inside the account-deletion transaction. */
  async deleteForAccount(tx: Tx, userId: string): Promise<void> {
    await tx.mfaChallenge.deleteMany({ where: { userId } });
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.mfaCredential.deleteMany({ where: { userId } });
  }
}
