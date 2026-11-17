import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { FastifyBaseLogger, FastifyRequest } from "fastify";

export interface RequestCtx {
  ip: string;
  deviceLabel: string | null;
  log: FastifyBaseLogger;
  requestId: string;
}

export interface AuthContext {
  userId: string;
  sessionId: string;
}

export type AuthedRequest = FastifyRequest & { auth?: AuthContext };

export function sanitizeLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = Array.from(raw)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f;
    })
    .join("")
    .trim()
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : null;
}

export const Ctx = createParamDecorator((_data: unknown, host: ExecutionContext): RequestCtx => {
  const req = host.switchToHttp().getRequest<FastifyRequest>();
  return {
    ip: req.ip,
    deviceLabel:
      sanitizeLabel(req.headers["x-device-label"]) ?? sanitizeLabel(req.headers["user-agent"]),
    log: req.log,
    requestId: req.id,
  };
});

export const CurrentUser = createParamDecorator(
  (_data: unknown, host: ExecutionContext): AuthContext => {
    const req = host.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) throw new Error("CurrentUser used on a route without @Authenticated()");
    return req.auth;
  },
);

/** Security events carry request id (bound by the logger), user id and session id only. */
export function logEvent(
  ctx: Pick<RequestCtx, "log">,
  event: string,
  fields: { userId?: string; sessionId?: string; outcome?: string } = {},
): void {
  ctx.log.info({ event, ...fields }, event);
}
