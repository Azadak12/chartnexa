import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import type { Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { FastifyBaseLogger } from "fastify";
import type { Bindings, ChildLoggerOptions } from "pino";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { UPLOAD_PART_BYTES } from "@chartnexa/api-contracts";
import type { AppConfig } from "./config/config.js";
import { ErrorFilter } from "./platform/error.filter.js";
import { LogErrorReporter, type ErrorReporter } from "./platform/error-reporter.js";
import { Metrics, metricsAccess } from "./platform/metrics.js";
import { resolveTraceId } from "./platform/trace.js";
import { createLogger } from "./platform/logger.js";
import { setupOpenApi } from "./platform/openapi.js";
import { resolveRequestId } from "./platform/request-id.js";

export async function createApp(
  config: AppConfig,
  logDestination?: NodeJS.WritableStream,
  /** Test-only hook for adding controllers. Not used in production. */
  extraControllers: Type<unknown>[] = [],
): Promise<NestFastifyApplication> {
  const logger = createLogger(config.LOG_LEVEL, logDestination);
  const metrics = new Metrics();
  const adapter = new FastifyAdapter({
    loggerInstance: logger,
    // Every log line of a request carries its trace id (from a valid traceparent, or a new one).
    childLoggerFactory: (
      parent: FastifyBaseLogger,
      bindings: Bindings,
      opts: ChildLoggerOptions,
      rawReq: IncomingMessage,
    ) => {
      const r = rawReq as IncomingMessage & { traceId?: string };
      r.traceId ??= resolveTraceId(rawReq.headers.traceparent);
      return parent.child({ ...bindings, traceId: r.traceId }, opts);
    },
    requestIdHeader: false,
    // Deprecated in Fastify 5 (removed in 6); migrate to a LogController instance before upgrading.
    requestIdLogLabel: "requestId",
    genReqId: (req: { headers: IncomingHttpHeaders }) =>
      resolveRequestId(req.headers["x-request-id"]),
  });
  const fastify = adapter.getInstance();
  // Upload parts arrive as raw bytes, one part (5 MB) at a time.
  fastify.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: UPLOAD_PART_BYTES + 1024 },
    (_req, body, done) => done(null, body),
  );
  fastify.addHook("onSend", (req, reply, payload, done) => {
    void reply.header("x-request-id", req.id);
    const traceId = (req.raw as { traceId?: string }).traceId;
    if (traceId) void reply.header("x-trace-id", traceId);
    done(null, payload);
  });
  // Counted by route pattern, never by raw URL, so ids and query values never become labels.
  fastify.addHook("onResponse", (req, reply, done) => {
    const route = req.routeOptions?.url ?? "unmatched";
    if (route !== "/metrics") {
      metrics.observeRequest(req.method, route, reply.statusCode, reply.elapsedTime / 1000);
    }
    done();
  });
  fastify.addHook("onClose", (_instance, done) => {
    metrics.stop();
    done();
  });
  fastify.get("/metrics", (req, reply) => {
    const access = metricsAccess(config.NODE_ENV, config.METRICS_TOKEN, req.headers.authorization);
    if (access === 404) {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Not found.", requestId: req.id });
    }
    if (access === 401) {
      return reply
        .code(401)
        .send({ code: "UNAUTHENTICATED", message: "Not allowed.", requestId: req.id });
    }
    return reply.header("content-type", "text/plain; version=0.0.4").send(metrics.render());
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(config, extraControllers),
    adapter,
    {
      logger: false,
    },
  );
  const reporter: ErrorReporter = new LogErrorReporter(logger);
  app.useGlobalFilters(new ErrorFilter(reporter, metrics));
  setupOpenApi(app, config.NODE_ENV);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
