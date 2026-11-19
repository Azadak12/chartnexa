import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { request } from "node:http";
import { join } from "node:path";
import type { TokenPair } from "@chartnexa/api-contracts";
import { authHttp } from "../src/auth/auth-http";

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
          const raw = Buffer.concat(chunks);
          const text = raw.toString("utf8");
          if ((res.statusCode ?? 0) >= 400 && process.env.CONTRACT_DEBUG)
            process.stderr.write(`RESP ${init.method} ${u.pathname} ${res.statusCode} ${text}\n`);
          resolve({
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            status: res.statusCode ?? 0,
            json: () => Promise.resolve(text ? JSON.parse(text) : null),
            arrayBuffer: () =>
              Promise.resolve(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)),
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

// --- two-step sign-in for Admins and Managers -------------------------------------------------

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of input.replace(/=+$/, "")) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238: SHA-1, 6 digits, 30-second steps. Independent of the server's implementation. */
export function totpCode(secretBase32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = (mac[mac.length - 1] as number) & 15;
  const bin =
    (((mac[offset] as number) & 127) << 24) |
    (((mac[offset + 1] as number) & 255) << 16) |
    (((mac[offset + 2] as number) & 255) << 8) |
    ((mac[offset + 3] as number) & 255);
  return String(bin % 1_000_000).padStart(6, "0");
}
export const currentStep = (): number => Math.floor(Date.now() / 30_000);

interface Enrolled {
  secret: string;
  recoveryCodes: string[];
  lastStep: number;
}
const enrolled = new Map<string, Enrolled>();

/** The tokens of a second-step sign-in, without the recovery-code count. */
function signInPair(r: {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: number;
}): TokenPair {
  return {
    accessToken: r.accessToken,
    refreshToken: r.refreshToken,
    sessionId: r.sessionId,
    expiresIn: r.expiresIn,
  };
}

/** Signs in a person who does not need a second step, and fails loudly if one is asked for. */
export async function loginPair(body: { email: string; password: string }): Promise<TokenPair> {
  const result = await authHttp.login(body);
  if (!("accessToken" in result)) throw new Error("A second sign-in step was asked for");
  return result;
}

/**
 * Signs in anyone. Admins and Managers go through the real second step: the first time they
 * enroll; after that a recovery code is used for each sign-in (a code cannot be used twice, and
 * waiting for a new 30-second step would make the suite slow), and a fresh authenticator code
 * once the recovery codes run out.
 */
export async function loginAny(email: string, password: string): Promise<TokenPair> {
  const result = await authHttp.login({ email, password });
  if ("accessToken" in result) return result;
  const known = enrolled.get(email);
  if (result.status === "mfa_setup_required") {
    const start = await authHttp.startMfaSetup(result.challengeToken);
    const step = currentStep();
    const done = await authHttp.completeMfaSetup({
      challengeToken: result.challengeToken,
      code: totpCode(start.secret, step),
    });
    const { recoveryCodes, ...pair } = done;
    enrolled.set(email, { secret: start.secret, recoveryCodes, lastStep: step });
    return pair;
  }
  if (!known) throw new Error(`No second step recorded for ${email}`);
  const recovery = known.recoveryCodes.shift();
  if (recovery) {
    return signInPair(
      await authHttp.verifyMfa({ challengeToken: result.challengeToken, code: recovery }),
    );
  }
  // No recovery codes left: use the next authenticator step, waiting if it is not valid yet.
  const step = Math.max(currentStep(), known.lastStep + 1);
  if (step > currentStep() + 1) {
    await new Promise((r) => setTimeout(r, (step - 1) * 30_000 - Date.now() + 200));
  }
  known.lastStep = step;
  return signInPair(
    await authHttp.verifyMfa({
      challengeToken: result.challengeToken,
      code: totpCode(known.secret, step),
    }),
  );
}
