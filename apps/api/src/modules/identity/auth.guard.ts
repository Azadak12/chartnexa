import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
} from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { PrismaService } from "../../database/prisma.service.js";
import { AccessTokenService } from "./tokens/access-token.service.js";
import type { AuthedRequest } from "./http/request-context.js";

const denied = () => new UnauthorizedException("Authentication required.");

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AccessTokenService) private readonly tokens: AccessTokenService,
    @Inject(PrismaService) private readonly db: PrismaService,
  ) {}

  async canActivate(host: ExecutionContext): Promise<boolean> {
    const req = host.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    const match = typeof header === "string" ? /^Bearer ([^\s]+)$/.exec(header) : null;
    if (!match) throw denied();

    const claims = await this.tokens.verify(match[1] as string);
    if (!claims) throw denied();

    // One primary-key lookup gives immediate effect for logout, disable and deletion.
    const session = await this.db.session.findUnique({
      where: { id: claims.sessionId },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        absoluteExpiresAt: true,
        user: { select: { status: true } },
      },
    });
    const now = new Date();
    if (
      !session ||
      session.userId !== claims.userId ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.absoluteExpiresAt <= now ||
      session.user.status !== "active"
    ) {
      throw denied();
    }
    req.auth = { userId: claims.userId, sessionId: claims.sessionId };
    return true;
  }
}

/** Marks a route as requiring a valid access token. */
export const Authenticated = () => applyDecorators(UseGuards(AuthGuard), ApiBearerAuth());
