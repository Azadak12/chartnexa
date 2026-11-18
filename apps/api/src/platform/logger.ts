import { pino, type Logger, type LoggerOptions } from "pino";

export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  "headers.authorization",
  "headers.cookie",
  "*.authorization",
  "*.cookie",
  "*.password",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.secret",
  "*.email",
  "*.newPassword",
  "*.currentPassword",
  "*.recoveryCode",
  "*.mfaCode",
  "*.otp",
  "*.challengeToken",
  "password",
  "token",
  "authorization",
  "email",
];

/** Keeps the path and the names of query parameters; drops every value (emails, search terms). */
export function safeUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const q = url.indexOf("?");
  if (q < 0) return url;
  const names = url
    .slice(q + 1)
    .split("&")
    .map((pair) => pair.split("=")[0] ?? "")
    .filter((n) => /^[A-Za-z0-9_.[\]-]{1,40}$/.test(n));
  return `${url.slice(0, q)}?${names.map((n) => `${n}=`).join("&")}`;
}

interface ReqLike {
  method?: string;
  url?: string;
  host?: string;
  hostname?: string;
  ip?: string;
  socket?: { remoteAddress?: string };
}

export function loggerOptions(level: string): LoggerOptions {
  return {
    level,
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    base: { service: "chartnexa-api" },
    serializers: {
      req: (req: ReqLike) => ({
        method: req.method,
        url: safeUrl(req.url),
        remoteAddress: req.ip ?? req.socket?.remoteAddress,
      }),
    },
  };
}

export function createLogger(level: string, destination?: NodeJS.WritableStream): Logger {
  return destination ? pino(loggerOptions(level), destination) : pino(loggerOptions(level));
}
