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
import type { AuthContext, AuthedRequest } from "./http/request-context.js";

const denied = () => new UnauthorizedException("Authentication required.");

/** Checks the bearer token and its session; returns who is calling, or null for any problem. */
async function resolveAuth(
  tokens: AccessTokenService,
  db: PrismaService,
  req: AuthedRequest,
): Promise<AuthContext | null> {
  const header = req.headers.authorization;
  const match = typeof header === "string" ? /^Bearer ([^\s]+)$/.exec(header) : null;
  if (!match) return null;

  const claims = await tokens.verify(match[1] as string);
  if (!claims) return null;

  // One primary-key lookup gives immediate effect for logout, disable and deletion.
  const session = await db.session.findUnique({
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
    return null;
  }
  return { userId: claims.userId, sessionId: claims.sessionId };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AccessTokenService) private readonly tokens: AccessTokenService,
    @Inject(PrismaService) private readonly db: PrismaService,
  ) {}

  async canActivate(host: ExecutionContext): Promise<boolean> {
    const req = host.switchToHttp().getRequest<AuthedRequest>();
    const auth = await resolveAuth(this.tokens, this.db, req);
    if (!auth) throw denied();
    req.auth = auth;
    return true;
  }
}

/**
 * For public routes that show more to a signed-in person. A missing, malformed, expired or
 * revoked token simply means "signed out": it never fails the request and never grants anything.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    @Inject(AccessTokenService) private readonly tokens: AccessTokenService,
    @Inject(PrismaService) private readonly db: PrismaService,
  ) {}

  async canActivate(host: ExecutionContext): Promise<boolean> {
    const req = host.switchToHttp().getRequest<AuthedRequest>();
    try {
      const auth = await resolveAuth(this.tokens, this.db, req);
      if (auth) req.auth = auth;
    } catch {
      // A broken token is the same as no token.
    }
    return true;
  }
}

/** Marks a route as requiring a valid access token. */
export const Authenticated = () => applyDecorators(UseGuards(AuthGuard), ApiBearerAuth());

/** Marks a public route that recognizes a signed-in caller when a valid token is present. */
export const OptionalAuthentication = () =>
  applyDecorators(UseGuards(OptionalAuthGuard), ApiBearerAuth());
