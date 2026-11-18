import { Inject, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import type { LoginRequest, LoginResponse } from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { PrismaService } from "../../database/prisma.service.js";
import { RateLimiterService } from "../rate-limit/index.js";
import { logEvent, type RequestCtx } from "./http/request-context.js";
import { MFA_GATE, type MfaGate } from "./mfa-gate.js";
import { PasswordService } from "./password/password.service.js";
import { SessionsService } from "./sessions/sessions.service.js";
import { hashEmailForKey } from "./tokens/token-util.js";

const invalidCredentials = () => new UnauthorizedException("Invalid email or password.");

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(RateLimiterService) private readonly limiter: RateLimiterService,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(MFA_GATE) private readonly mfa?: MfaGate,
  ) {}

  async login(input: LoginRequest, ctx: RequestCtx): Promise<LoginResponse> {
    const emailKey = `login:email:${hashEmailForKey(input.email)}`;
    const ipKey = `login:ip:${ctx.ip}`;
    const window = this.config.RL_LOGIN_WINDOW_SECONDS;
    // Only failures count, and a blocked caller is refused even with the right password.
    await this.limiter.assertBelow(emailKey, this.config.RL_LOGIN_EMAIL_MAX, window);
    await this.limiter.assertBelow(ipKey, this.config.RL_LOGIN_IP_MAX, window);

    const user = await this.db.user.findUnique({ where: { emailNormalized: input.email } });
    let valid = false;
    if (user?.passwordHash && user.status === "active") {
      valid = await this.passwords.verify(input.password, user.passwordHash);
    } else {
      await this.passwords.verifyDummy(input.password);
    }

    if (!valid || !user) {
      await Promise.all([this.limiter.hit(emailKey, window), this.limiter.hit(ipKey, window)]);
      logEvent(ctx, "auth.login.failure", { outcome: "invalid_credentials" });
      throw invalidCredentials();
    }

    if (user.passwordHash && this.passwords.needsRehash(user.passwordHash)) {
      await this.db.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.passwords.hash(input.password) },
      });
    }
    // Admins and Managers must pass a second step before any session exists.
    const challenge = await this.mfa?.challengeFor(user.id, ctx);
    if (challenge) {
      logEvent(ctx, "auth.login.mfa_challenge", { userId: user.id, outcome: challenge.status });
      return challenge;
    }
    const pair = await this.sessions.createSession(user.id, input.deviceLabel ?? ctx.deviceLabel);
    logEvent(ctx, "auth.login.success", { userId: user.id, sessionId: pair.sessionId });
    return pair;
  }
}
