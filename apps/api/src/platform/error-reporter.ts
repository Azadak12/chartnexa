import type { Logger } from "pino";
import { safeError } from "./error-class.js";

export interface ErrorContext {
  requestId: string;
  /** The request's own logger, so the line carries the request and trace ids. */
  log?: Pick<Logger, "error"> | undefined;
  traceId?: string | undefined;
  method?: string | undefined;
  route?: string | undefined;
}

/**
 * Where unexpected errors go. The default writes one safe log line; an external error-tracking
 * service can implement this later (decision Q31) without touching the code that reports.
 */
export interface ErrorReporter {
  report(error: unknown, context: ErrorContext): void;
}

export class LogErrorReporter implements ErrorReporter {
  constructor(private readonly log: Pick<Logger, "error">) {}
  report(error: unknown, context: ErrorContext): void {
    const { log, ...rest } = context;
    (log ?? this.log).error({ err: safeError(error), ...rest }, "unhandled error");
  }
}
