import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { request } from "node:http";
import { join } from "node:path";

/** A minimal fetch over node:http, because the React Native test setup replaces global fetch. */
export function realFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: init.method ?? "GET",
        // A fresh connection per request avoids reusing sockets the server has already closed.
        agent: false,
        // Real HTTP clients send a length; without one Node would send neither length nor chunking.
        headers: {
          ...init.headers,
          "content-length": String(Buffer.byteLength((init.body as string | undefined) ?? "")),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 0) >= 400 && process.env.CONTRACT_DEBUG)
            process.stderr.write(`RESP ${init.method} ${u.pathname} ${res.statusCode} ${text}\n`);
          resolve({
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            status: res.statusCode ?? 0,
            json: () => Promise.resolve(text ? JSON.parse(text) : null),
            headers: {
              get: (k: string) => (res.headers[k.toLowerCase()] as string | undefined) ?? null,
            },
          } as unknown as Response);
        });
      },
    );
    req.on("error", (e) => {
      process.stderr.write(`REALFETCH_ERR ${init.method} ${url} ${String(e)}\n`);
      reject(e);
    });
    if (init.body) req.write(init.body as string);
    req.end();
  });
}

/** Reads the newest email sent to an address and returns the token from its link. */
export async function waitForToken(to: string, subjectIncludes: string): Promise<string> {
  const dir = process.env.CONTRACT_MAIL_DIR as string;
  for (let i = 0; i < 100; i++) {
    let files: string[] = [];
    try {
      files = readdirSync(dir).sort().reverse();
    } catch {
      // directory not created yet
    }
    for (const f of files) {
      const text = readFileSync(join(dir, f), "utf8");
      if (text.startsWith(`To: ${to}\n`) && text.includes(`Subject: ${subjectIncludes}`)) {
        const m = /token=([^\s]+)/.exec(text);
        if (m) return decodeURIComponent(m[1] as string);
      }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`No "${subjectIncludes}" email for ${to}`);
}

let counter = 0;
export const uniqueEmail = (): string => `contract-${Date.now()}-${++counter}@example.com`;
export const GOOD_PASSWORD = "correct horse battery staple";

/**
 * Makes an existing account an Admin with the real operator command. `--recovery` is used so the
 * helper works however many Admins earlier tests created.
 */
export function makeAdmin(email: string): void {
  const root = join(__dirname, "..", "..", "..");
  const r = spawnSync(
    "pnpm",
    [
      "--filter",
      "@chartnexa/api",
      "exec",
      "tsx",
      "scripts/admin-bootstrap.ts",
      "--",
      "--email",
      email,
      "--recovery",
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        DATABASE_URL: process.env.CONTRACT_DATABASE_URL,
        CURSOR_SECRET: "contract-cursor-secret-contract-cursor",
        ACCESS_TOKEN_SECRET: "contract-access-secret-contract-access",
        MAILER_DRIVER: "memory",
      },
    },
  );
  if (r.status !== 0) throw new Error(`admin bootstrap failed: ${r.stdout}${r.stderr}`);
}
