import type { IncomingHttpHeaders } from "node:http";
import type { Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import type { AppConfig } from "./config/config.js";
import { ErrorFilter } from "./platform/error.filter.js";
import { createLogger } from "./platform/logger.js";
import { setupOpenApi } from "./platform/openapi.js";
import { resolveRequestId } from "./platform/request-id.js";

export async function createApp(
  config: AppConfig,
  logDestination?: NodeJS.WritableStream,
  /** Test-only hook for adding controllers. Not used in production. */
  extraControllers: Type<unknown>[] = [],
): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    loggerInstance: createLogger(config.LOG_LEVEL, logDestination),
    requestIdHeader: false,
    // Deprecated in Fastify 5 (removed in 6); migrate to a LogController instance before upgrading.
    requestIdLogLabel: "requestId",
    genReqId: (req: { headers: IncomingHttpHeaders }) =>
      resolveRequestId(req.headers["x-request-id"]),
  });
  adapter.getInstance().addHook("onSend", (req, reply, payload, done) => {
    void reply.header("x-request-id", req.id);
    done(null, payload);
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(config, extraControllers),
    adapter,
    {
      logger: false,
    },
  );
  app.useGlobalFilters(new ErrorFilter());
  setupOpenApi(app, config.NODE_ENV);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
