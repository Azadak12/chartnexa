import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ErrorEnvelope } from "@chartnexa/api-contracts";
import { classifyError } from "./error-class.js";
import type { ErrorReporter } from "./error-reporter.js";
import type { Metrics } from "./metrics.js";
import { RateLimitedException } from "./rate-limited.exception.js";
import { ValidationFailed } from "./zod.pipe.js";

const CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
  503: "UNAVAILABLE",
};

export function toEnvelope(
  exception: unknown,
  requestId: string,
): { status: number; body: ErrorEnvelope } {
  if (exception instanceof ValidationFailed) {
    return {
      status: 400,
      body: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed.",
        requestId,
        fields: exception.fields,
      },
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status < 500) {
      return {
        status,
        body: {
          code: stableCode(exception) ?? CODES[status] ?? "ERROR",
          message: safeMessage(exception),
          requestId,
        },
      };
    }
    return {
      status,
      body: { code: CODES[status] ?? "SERVER_ERROR", message: safeMessage(exception), requestId },
    };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again.", requestId },
  };
}

/** A code we set ourselves, as `new ForbiddenException({ message, code: "SOME_CODE" })`. */
function stableCode(e: HttpException): string | undefined {
  const r = e.getResponse();
  const code = typeof r === "object" ? (r as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^[A-Z][A-Z_]{2,40}$/.test(code) ? code : undefined;
}

/** Only HttpException messages we construct ourselves are shown; nothing from internals. */
function safeMessage(e: HttpException): string {
  const r = e.getResponse();
  const raw = typeof r === "string" ? r : (r as { message?: unknown }).message;
  return typeof raw === "string" ? raw : e.message;
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  constructor(
    private readonly reporter?: ErrorReporter,
    private readonly metrics?: Metrics,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();
    const { status, body } = toEnvelope(exception, req.id);
    if (status >= 500) {
      // One safe line per unexpected error: type, code, class and stack frames, never the message.
      this.metrics?.observeError(classifyError(exception));
      const context = {
        requestId: req.id,
        traceId: (req.raw as { traceId?: string }).traceId,
        method: req.method,
        route: req.routeOptions?.url,
        log: req.log,
      };
      if (this.reporter) this.reporter.report(exception, context);
    }
    if (exception instanceof RateLimitedException) {
      void reply.header("retry-after", String(exception.retryAfterSeconds));
    }
    void reply.status(status).header("content-type", "application/json").send(body);
  }
}
