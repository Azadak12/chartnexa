import { z } from "zod";
import { DEV_MFA_KEY, parseKey } from "../platform/secret-box.js";

export const CONFIG = Symbol("CONFIG");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z
    .string()
    .min(1)
    .regex(/^postgres(ql)?:\/\//, "must be a postgresql:// URL"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  CURSOR_SECRET: z.string().min(32, "must be at least 32 characters"),
  ACCESS_TOKEN_SECRET: z.string().min(32, "must be at least 32 characters"),
  ACCESS_TOKEN_SECRET_PREVIOUS: z.string().min(32, "must be at least 32 characters").optional(),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(600),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  SESSION_MAX_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  /** 32 bytes, base64. Protects stored authenticator secrets. Required in production. */
  MFA_ENCRYPTION_KEY: z.string().min(1).optional(),
  MFA_CHALLENGE_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  MFA_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  RL_MFA_USER_MAX: z.coerce.number().int().min(1).default(10),
  RL_MFA_WINDOW_SECONDS: z.coerce.number().int().min(1).default(900),
  MAILER_DRIVER: z.enum(["dev", "memory"]).default("dev"),
  /** Where uploaded files live. Only the local-disk driver exists; production refuses it. */
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_DIR: z.string().min(1).default(".dev-storage"),
  /** Malware scanning. Only "none" exists; files are marked not scanned and production refuses it. */
  SCANNER: z.enum(["none"]).default("none"),
  /** Video hosting. Only the "test" adapter exists (no transcoding); production refuses it. */
  VIDEO_PROVIDER: z.enum(["test"]).default("test"),
  /** Lifetime of a playback link; long enough for a lesson, since players fetch ranges throughout. */
  VIDEO_LINK_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(14_400),
  /** Share of a video to watch for the lesson to count as complete (Q07 proposal: 90). */
  VIDEO_COMPLETION_PERCENT: z.coerce.number().int().min(50).max(100).default(90),
  /** Payments run in test mode only (owner decision C17); production refuses the test provider. */
  PAYMENT_PROVIDER: z.enum(["test"]).default("test"),
  /** Signs test-provider events. Development default only; a real provider has its own secret. */
  PAYMENT_TEST_WEBHOOK_SECRET: z
    .string()
    .min(32)
    .default("test-webhook-secret-test-webhook-secret"),
  /** Lifetime of a signed link to read a file. */
  FILE_LINK_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  APP_LINK_BASE: z.string().min(1).default("chartnexa://"),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  RL_LOGIN_EMAIL_MAX: z.coerce.number().int().min(1).default(5),
  RL_LOGIN_IP_MAX: z.coerce.number().int().min(1).default(20),
  RL_LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(1).default(900),
  RL_FORGOT_EMAIL_MAX: z.coerce.number().int().min(1).default(3),
  RL_FORGOT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(3600),
  RL_REGISTER_IP_MAX: z.coerce.number().int().min(1).default(10),
  RL_REGISTER_WINDOW_SECONDS: z.coerce.number().int().min(1).default(3600),
  RL_REVIEW_USER_MAX: z.coerce.number().int().min(1).default(30),
  RL_REVIEW_WINDOW_SECONDS: z.coerce.number().int().min(1).default(3600),
  RL_REVIEW_REPORT_MAX: z.coerce.number().int().min(1).default(20),
  RL_REVIEW_REPORT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(86400),
  /** Bearer token for GET /metrics. In production the endpoint is off without it. */
  METRICS_TOKEN: z.string().min(32).optional(),
  RL_GENERIC_IP_MAX: z.coerce.number().int().min(1).default(60),
  RL_GENERIC_WINDOW_SECONDS: z.coerce.number().int().min(1).default(900),
});

const checked = schema.superRefine((c, ctx) => {
  if (c.MFA_ENCRYPTION_KEY !== undefined && parseKey(c.MFA_ENCRYPTION_KEY) === null) {
    ctx.addIssue({
      code: "custom",
      path: ["MFA_ENCRYPTION_KEY"],
      message: "must be 32 random bytes encoded as base64",
    });
  }
  if (
    c.NODE_ENV === "production" &&
    (c.MFA_ENCRYPTION_KEY === undefined || c.MFA_ENCRYPTION_KEY === DEV_MFA_KEY)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["MFA_ENCRYPTION_KEY"],
      message: "a real encryption key is required in production",
    });
  }
  if (c.NODE_ENV === "production" && c.STORAGE_DRIVER === "local") {
    ctx.addIssue({
      code: "custom",
      path: ["STORAGE_DRIVER"],
      message: "local-disk storage is not allowed in production; a storage provider is pending",
    });
  }
  if (c.NODE_ENV === "production" && c.PAYMENT_PROVIDER === "test") {
    ctx.addIssue({
      code: "custom",
      path: ["PAYMENT_PROVIDER"],
      message:
        "the test payment provider is not allowed in production; the payment strategy is pending",
    });
  }
  if (c.NODE_ENV === "production" && c.VIDEO_PROVIDER === "test") {
    ctx.addIssue({
      code: "custom",
      path: ["VIDEO_PROVIDER"],
      message: "the test video adapter is not allowed in production; a video provider is pending",
    });
  }
  if (c.NODE_ENV === "production" && c.SCANNER === "none") {
    ctx.addIssue({
      code: "custom",
      path: ["SCANNER"],
      message: "uploads must be scanned in production; a scanning provider is pending",
    });
  }
  // Only dev and memory senders exist today, so production is rejected until a real provider is added.
  if (c.NODE_ENV === "production" && (c.MAILER_DRIVER === "dev" || c.MAILER_DRIVER === "memory")) {
    ctx.addIssue({
      code: "custom",
      path: ["MAILER_DRIVER"],
      message: "the dev and memory mail senders are not allowed in production",
    });
  }
});

export type AppConfig = z.infer<typeof schema>;

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid configuration: ${issues.join("; ")}`);
    this.name = "ConfigError";
  }
}

/** Validates environment variables. Messages name variables only, never their values. */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const result = checked.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      const key = i.path.join(".") || "(root)";
      return `${key}: ${i.code === "invalid_type" && env[key] === undefined ? "is required" : i.message}`;
    });
    throw new ConfigError(issues);
  }
  return result.data;
}
