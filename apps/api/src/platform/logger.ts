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
  "password",
  "token",
  "authorization",
  "email",
];

export function loggerOptions(level: string): LoggerOptions {
  return {
    level,
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    base: { service: "chartnexa-api" },
  };
}

export function createLogger(level: string, destination?: NodeJS.WritableStream): Logger {
  return destination ? pino(loggerOptions(level), destination) : pino(loggerOptions(level));
}
