import "reflect-metadata";
import { parseArgs } from "node:util";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { ConfigError, loadConfig } from "../config/config.js";
import { RolesService } from "../modules/access/index.js";
import { MfaService } from "../modules/mfa/index.js";

export interface CommandResult {
  exitCode: 0 | 1;
  message: string;
}

const USAGE = "Usage: admin:bootstrap -- --email <address> [--recovery | --reset-mfa]";

/**
 * Operator-run: needs database access (the trust boundary). Makes an existing verified
 * account the first Admin; --recovery is for a sole Admin who cannot sign in and is audited.
 */
export async function runBootstrap(
  argv: string[],
  env: Record<string, string | undefined>,
): Promise<CommandResult> {
  let values: {
    email?: string | undefined;
    recovery?: boolean | undefined;
    "reset-mfa"?: boolean | undefined;
  };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        email: { type: "string" },
        recovery: { type: "boolean" },
        "reset-mfa": { type: "boolean" },
      },
      strict: true,
    }));
  } catch {
    return { exitCode: 1, message: USAGE };
  }
  if (!values.email || (values.recovery && values["reset-mfa"])) {
    return { exitCode: 1, message: USAGE };
  }

  let config;
  try {
    config = loadConfig(env);
  } catch (e) {
    return {
      exitCode: 1,
      message: e instanceof ConfigError ? e.message : "Failed to load configuration",
    };
  }

  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: false,
  });
  try {
    // Lost both phone and recovery codes: remove the second step so the person can enroll again.
    if (values["reset-mfa"]) {
      const reset = await app.get(MfaService).resetForOperator(values.email);
      return { exitCode: reset.ok ? 0 : 1, message: reset.message };
    }
    const result = await app.get(RolesService).bootstrapAdmin(values.email, {
      recovery: values.recovery === true,
    });
    return { exitCode: result.ok ? 0 : 1, message: result.message };
  } finally {
    await app.close();
  }
}
