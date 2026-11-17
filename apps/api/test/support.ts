import "reflect-metadata";
import { Writable } from "node:stream";
import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { z } from "zod";
import { createApp } from "../src/app.factory.js";
import { loadConfig } from "../src/config/config.js";
import { decodeCursor, pageParamsSchema } from "../src/pagination/cursor.js";
import { ZodPipe } from "../src/platform/zod.pipe.js";

export const CURSOR_SECRET = "test-cursor-secret-test-cursor-secret";

const bodySchema = z.strictObject({ name: z.string().min(2) });

@Controller("test")
export class TestController {
  @Post("echo")
  echo(@Body(new ZodPipe(bodySchema)) body: z.infer<typeof bodySchema>): { name: string } {
    return body;
  }

  @Get("boom")
  boom(): never {
    throw new Error("password=hunter2 at /srv/secret/path.ts");
  }

  @Get("page")
  page(@Query(new ZodPipe(pageParamsSchema)) q: z.infer<typeof pageParamsSchema>): {
    limit: number;
  } {
    if (q.cursor) decodeCursor(q.cursor, CURSOR_SECRET);
    return { limit: q.limit };
  }
}

export interface TestApp {
  app: NestFastifyApplication;
  logs: () => string;
}

export async function startApp(
  overrides: Record<string, string | undefined> & { DATABASE_URL: string },
  options: { asProduction?: boolean } = {},
): Promise<TestApp> {
  const chunks: string[] = [];
  const sink = new Writable({
    write(chunk, _e, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  const loaded = loadConfig({
    NODE_ENV: "test",
    PORT: "3000",
    LOG_LEVEL: "info",
    DATABASE_POOL_MAX: "2",
    CURSOR_SECRET,
    ACCESS_TOKEN_SECRET: "test-access-secret-test-access-secret",
    MAILER_DRIVER: "memory",
    ...overrides,
  });
  // Production config validation forbids test mailers, so tests flip the flag after loading.
  const config = options.asProduction ? { ...loaded, NODE_ENV: "production" as const } : loaded;
  const app = await createApp(config, sink, [TestController]);
  return { app, logs: () => chunks.join("") };
}
