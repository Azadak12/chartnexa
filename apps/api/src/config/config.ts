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
  const result = schema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      const key = i.path.join(".") || "(root)";
      return `${key}: ${i.code === "invalid_type" && env[key] === undefined ? "is required" : i.message}`;
    });
    throw new ConfigError(issues);
  }
  return result.data;
}
