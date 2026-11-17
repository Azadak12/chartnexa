import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type {
  ChangePasswordRequest,
  DeleteAccountRequest,
  ForgotPasswordRequest,
  MeResponse,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
} from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../../config/config.js";
import { PrismaService } from "../../../database/prisma.service.js";
import { ValidationFailed } from "../../../platform/zod.pipe.js";
import { MAILER, type Mailer } from "../../mailer/index.js";
import { RateLimiterService } from "../../rate-limit/index.js";
import { logEvent, type RequestCtx } from "../http/request-context.js";
import { checkPasswordPolicy, PasswordService } from "../password/password.service.js";
import { AccountDeletionHooks } from "./deletion-hooks.js";
import { SessionsService } from "../sessions/sessions.service.js";
import { hashEmailForKey, hashToken, newOpaqueToken } from "../tokens/token-util.js";

const HOUR_MS = 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * HOUR_MS;
const RESET_TTL_MS = 30 * 60 * 1000;

export const invalidToken = () => new BadRequestException("Invalid or expired token.");

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

@Injectable()
export class AccountsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(RateLimiterService) private readonly limiter: RateLimiterService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(AccountDeletionHooks) private readonly deletionHooks: AccountDeletionHooks,
  ) {}

  private policyOrThrow(password: string, email: string | null, field = "password"): void {
    const r = checkPasswordPolicy(password, email);
    if (!r.ok) throw new ValidationFailed([{ field, message: r.message }]);
  }

  /** Creates a fresh single-use token, invalidating earlier unused ones of the same type. */
  private async issueToken(
    userId: string,
    type: "email_verification" | "password_reset",
    ttlMs: number,
  ): Promise<string> {
    const raw = newOpaqueToken();
    await this.db.$transaction([
      this.db.oneTimeToken.updateMany({
        where: { userId, type, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.db.oneTimeToken.create({
        data: { userId, type, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + ttlMs) },
      }),
    ]);
    return raw;
  }

  async register(input: RegisterRequest, ctx: RequestCtx): Promise<void> {
    await this.limiter.consume(
      `register:ip:${ctx.ip}`,
      this.config.RL_REGISTER_IP_MAX,
      this.config.RL_REGISTER_WINDOW_SECONDS,
    );
    this.policyOrThrow(input.password, input.email);
    // Always hash, even when the email exists, so timing does not reveal registered emails.
    const passwordHash = await this.passwords.hash(input.password);
    try {
      const user = await this.db.user.create({
        data: {
          email: input.email,
          emailNormalized: input.email,
          passwordHash,
          displayName: input.displayName ?? null,
        },
      });
      const token = await this.issueToken(user.id, "email_verification", VERIFY_TTL_MS);
      await this.mailer.send({ to: input.email, template: "verify_email", data: { token } });
      logEvent(ctx, "auth.account.registered", { userId: user.id });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // Same response as a new registration; the owner is told instead (rate limited so
      // this cannot be used to spam them).
      try {
        await this.limiter.consume(
          `registration-notice:${hashEmailForKey(input.email)}`,
          this.config.RL_FORGOT_EMAIL_MAX,
          this.config.RL_FORGOT_WINDOW_SECONDS,
        );
        await this.mailer.send({ to: input.email, template: "registration_attempt", data: {} });
      } catch {
        // limit reached: stay silent
      }
      logEvent(ctx, "auth.account.registration_duplicate");
    }
  }

  async verifyEmail(token: string, ctx: RequestCtx): Promise<void> {
    await this.limiter.consume(
      `generic:ip:${ctx.ip}`,
      this.config.RL_GENERIC_IP_MAX,
      this.config.RL_GENERIC_WINDOW_SECONDS,
    );
    const hash = hashToken(token);
    const ok = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ user_id: string }[]>`
        UPDATE one_time_tokens SET used_at = now()
        WHERE token_hash = ${hash} AND type = 'email_verification'
          AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`;
      const userId = rows[0]?.user_id;
      if (!userId) return false;
      await tx.user.updateMany({
        where: { id: userId, deletedAt: null },
        data: { emailVerifiedAt: new Date() },
      });
      return true;
    });
    if (!ok) throw invalidToken();
  }

  async resendVerification(userId: string, ctx: RequestCtx): Promise<void> {
    await this.limiter.consume(
      `resend:user:${userId}`,
      this.config.RL_FORGOT_EMAIL_MAX,
      this.config.RL_FORGOT_WINDOW_SECONDS,
    );
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user || !user.email || user.emailVerifiedAt) return;
    const token = await this.issueToken(user.id, "email_verification", VERIFY_TTL_MS);
    await this.mailer.send({ to: user.email, template: "verify_email", data: { token } });
    logEvent(ctx, "auth.email.verification_resent", { userId });
  }

  async me(userId: string): Promise<MeResponse> {
    const u = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      id: u.id,
      email: u.email ?? "",
      displayName: u.displayName,
      emailVerified: u.emailVerifiedAt !== null,
      createdAt: u.createdAt.toISOString(),
    };
  }

  async updateProfile(userId: string, input: UpdateProfileRequest): Promise<MeResponse> {
    await this.db.user.update({ where: { id: userId }, data: { displayName: input.displayName } });
    return this.me(userId);
  }

  /** Verifies the caller's current password, counting failures toward a per-user limit. */
  private async requirePassword(userId: string, password: string, scope: string): Promise<void> {
    const key = `${scope}:user:${userId}`;
    await this.limiter.assertBelow(
      key,
      this.config.RL_LOGIN_EMAIL_MAX,
      this.config.RL_LOGIN_WINDOW_SECONDS,
    );
    const user = await this.db.user.findUnique({ where: { id: userId } });
    const ok = user?.passwordHash
      ? await this.passwords.verify(password, user.passwordHash)
      : false;
    if (!ok) {
      await this.limiter.hit(key, this.config.RL_LOGIN_WINDOW_SECONDS);
      throw new UnauthorizedException("Incorrect password.");
    }
  }

  async deleteAccount(userId: string, input: DeleteAccountRequest, ctx: RequestCtx): Promise<void> {
    await this.requirePassword(userId, input.password, "delete");
    await this.db.$transaction(async (tx) => {
      // Other modules may end roles or veto the deletion (for example the last Admin).
      await this.deletionHooks.runAll(tx, userId, ctx);
      await tx.user.update({
        where: { id: userId },
        data: {
          email: null,
          emailNormalized: null,
          passwordHash: null,
          displayName: null,
          status: "deleted",
          deletedAt: new Date(),
          authzVersion: { increment: 1 },
        },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "account_deleted" },
      });
      await tx.oneTimeToken.deleteMany({ where: { userId } });
    });
    logEvent(ctx, "auth.account.deleted", { userId });
  }

  async changePassword(
    userId: string,
    sessionId: string,
    input: ChangePasswordRequest,
    ctx: RequestCtx,
  ): Promise<void> {
    await this.requirePassword(userId, input.currentPassword, "change-password");
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    this.policyOrThrow(input.newPassword, user.email, "newPassword");
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.db.user.update({
      where: { id: userId },
      data: { passwordHash, authzVersion: { increment: 1 } },
    });
    await this.sessions.revokeAll(userId, "password_changed", sessionId);
    logEvent(ctx, "auth.password.changed", { userId, sessionId });
  }

  async forgotPassword(input: ForgotPasswordRequest, ctx: RequestCtx): Promise<void> {
    await this.limiter.consume(
      `forgot:ip:${ctx.ip}`,
      this.config.RL_GENERIC_IP_MAX,
      this.config.RL_GENERIC_WINDOW_SECONDS,
    );
    await this.limiter.consume(
      `forgot:email:${hashEmailForKey(input.email)}`,
      this.config.RL_FORGOT_EMAIL_MAX,
      this.config.RL_FORGOT_WINDOW_SECONDS,
    );
    const user = await this.db.user.findUnique({ where: { emailNormalized: input.email } });
    if (!user || user.status !== "active" || !user.email) return;
    const token = await this.issueToken(user.id, "password_reset", RESET_TTL_MS);
    await this.mailer.send({ to: user.email, template: "password_reset", data: { token } });
    logEvent(ctx, "auth.password.reset_requested", { userId: user.id });
  }

  async resetPassword(input: ResetPasswordRequest, ctx: RequestCtx): Promise<void> {
    await this.limiter.consume(
      `generic:ip:${ctx.ip}`,
      this.config.RL_GENERIC_IP_MAX,
      this.config.RL_GENERIC_WINDOW_SECONDS,
    );
    const hash = hashToken(input.token);
    const row = await this.db.oneTimeToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    const now = new Date();
    if (
      !row ||
      row.type !== "password_reset" ||
      row.usedAt ||
      row.expiresAt <= now ||
      row.user.status !== "active"
    ) {
      throw invalidToken();
    }
    // Policy is checked before redeeming so a weak password does not burn the token.
    this.policyOrThrow(input.newPassword, row.user.email, "newPassword");
    const passwordHash = await this.passwords.hash(input.newPassword);

    const userId = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ user_id: string }[]>`
        UPDATE one_time_tokens SET used_at = now()
        WHERE token_hash = ${hash} AND type = 'password_reset'
          AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`;
      const uid = rows[0]?.user_id;
      if (!uid) return null;
      await tx.user.update({
        where: { id: uid },
        data: { passwordHash, authzVersion: { increment: 1 } },
      });
      await tx.oneTimeToken.updateMany({
        where: { userId: uid, type: "password_reset", usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.session.updateMany({
        where: { userId: uid, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "password_reset" },
      });
      return uid;
    });
    if (!userId) throw invalidToken();
    logEvent(ctx, "auth.password.reset", { userId });
  }
}
