import { z } from "zod";

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
  MAILER_DRIVER: z.enum(["dev", "memory"]).default("dev"),
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
  RL_GENERIC_IP_MAX: z.coerce.number().int().min(1).default(60),
  RL_GENERIC_WINDOW_SECONDS: z.coerce.number().int().min(1).default(900),
});

const checked = schema.superRefine((c, ctx) => {
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
