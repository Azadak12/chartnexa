import { randomBytes, randomUUID } from "node:crypto";
import type { LightMyRequestResponse } from "fastify";
import { MAILER, MemoryMailer, type MailMessage } from "../src/modules/mailer/index.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { startApp, type TestApp } from "./support.js";

export const GOOD_PASSWORD = "correct horse battery";

export function freshIp(): string {
  const b = randomBytes(3);
  return `10.${b[0]}.${b[1]}.${b[2]}`;
}
export const freshEmail = (): string => `user-${randomUUID()}@Example.com`;

export interface Harness {
  t: TestApp;
  mailer: MemoryMailer;
  db: PrismaService;
  call: (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    opts?: { body?: unknown; token?: string; ip?: string; headers?: Record<string, string> },
  ) => Promise<LightMyRequestResponse>;
  register: (opts?: {
    email?: string;
    password?: string;
    ip?: string;
  }) => Promise<{ email: string; password: string }>;
  login: (email: string, password: string, ip?: string) => Promise<LightMyRequestResponse>;
  signIn: (email?: string) => Promise<{
    email: string;
    password: string;
    accessToken: string;
    refreshToken: string;
    sessionId: string;
  }>;
  tokenFor: (email: string, template: MailMessage["template"]) => string;
}

export async function makeHarness(
  dbUrl: string,
  overrides: Record<string, string> = {},
): Promise<Harness> {
  const t = await startApp({ DATABASE_URL: dbUrl, ...overrides });
  const mailer = t.app.get<MemoryMailer>(MAILER);
  const db = t.app.get(PrismaService);
  const h: Harness = {
    t,
    mailer,
    db,
    call: (method, url, opts = {}) =>
      t.app.inject({
        method,
        url,
        remoteAddress: opts.ip ?? freshIp(),
        headers: {
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
          ...opts.headers,
        },
        ...(opts.body !== undefined ? { payload: opts.body as object } : {}),
      }),
    register: async (opts = {}) => {
      const email = opts.email ?? freshEmail();
      const password = opts.password ?? GOOD_PASSWORD;
      const res = await h.call("POST", "/auth/register", {
        body: { email, password },
        ...(opts.ip ? { ip: opts.ip } : {}),
      });
      if (res.statusCode !== 202) throw new Error(`register failed: ${res.statusCode} ${res.body}`);
      return { email, password };
    },
    login: (email, password, ip) =>
      h.call("POST", "/auth/login", { body: { email, password }, ...(ip ? { ip } : {}) }),
    signIn: async (email) => {
      const { email: e, password } = await h.register(email ? { email } : {});
      const res = await h.login(e, password);
      if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
      const j = res.json();
      return {
        email: e,
        password,
        accessToken: j.accessToken,
        refreshToken: j.refreshToken,
        sessionId: j.sessionId,
      };
    },
    tokenFor: (email, template) => {
      const m = mailer.last(email.toLowerCase(), template);
      if (!m) throw new Error(`no ${template} email for ${email}`);
      return m.data["token"] as string;
    },
  };
  return h;
}

/** Body without the per-request id, for comparing responses that must be indistinguishable. */
export function stripRequestId(res: LightMyRequestResponse): { status: number; body: unknown } {
  const body = res.json() as Record<string, unknown>;
  const rest = { ...body };
  delete rest["requestId"];
  return { status: res.statusCode, body: rest };
}
