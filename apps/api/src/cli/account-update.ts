import "reflect-metadata";
import { parseArgs } from "node:util";
import { randomBytes } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { ConfigError, loadConfig } from "../config/config.js";
import { AuditService } from "../modules/access/index.js";
import { checkPasswordPolicy, PasswordService } from "../modules/identity/index.js";
import { PrismaService } from "../database/prisma.service.js";

export interface CommandResult {
  exitCode: 0 | 1;
  message: string;
}

const USAGE =
  "Usage: account:update -- --email <current> [--new-email <address>] [--password-env <VAR> | --generate-password]";

export interface AccountUpdate {
  email: string;
  newEmail?: string | undefined;
  /** A new password in plain text, or undefined to leave it as it is. */
  newPassword?: string | undefined;
}

/**
 * Changes an account's sign-in email and/or password in place. The account is found, and keeps
 * its identity, by its id: roles, per-course permissions, enrolments, progress, reviews and
 * assignments are linked to that id, so none of them move or change. Every open session is
 * ended so the old password stops working at once. Audited.
 */
export async function applyAccountUpdate(
  db: PrismaService,
  passwords: PasswordService,
  audit: AuditService,
  input: AccountUpdate,
): Promise<CommandResult> {
  const current = input.email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { emailNormalized: current } });
  if (!user) return { exitCode: 1, message: "No account uses that email." };
  const next = input.newEmail?.trim().toLowerCase();
  if (next !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next) || next.length > 254) {
      return { exitCode: 1, message: "The new email is not a valid address." };
    }
    if (next !== current && (await db.user.findUnique({ where: { emailNormalized: next } }))) {
      return { exitCode: 1, message: "Another account already uses the new email." };
    }
  }
  if (input.newPassword !== undefined) {
    const policy = checkPasswordPolicy(input.newPassword, next ?? current);
    if (!policy.ok) return { exitCode: 1, message: policy.message };
  }
  if (next === undefined && input.newPassword === undefined) {
    return {
      exitCode: 1,
      message: "Nothing to change. Give --new-email and/or a password option.",
    };
  }
  const passwordHash =
    input.newPassword !== undefined ? await passwords.hash(input.newPassword) : undefined;
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        ...(next !== undefined ? { email: next, emailNormalized: next } : {}),
        ...(passwordHash !== undefined ? { passwordHash } : {}),
        // An operator set this address, so it counts as confirmed.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });
    await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "credentials_changed" },
    });
    await audit.record(tx, {
      actorKind: "system",
      action: "account.credentials_changed",
      targetType: "user",
      targetId: user.id,
      outcome: "success",
      reason: "operator_command",
      after: { emailChanged: next !== undefined, passwordChanged: passwordHash !== undefined },
    });
  });
  const what = [next !== undefined ? "email" : null, passwordHash ? "password" : null]
    .filter(Boolean)
    .join(" and ");
  return {
    exitCode: 0,
    message: `Updated the ${what} for account ${user.id}. Its role, permissions and data are unchanged; its sessions were ended.`,
  };
}

/** Operator-run: needs database access. Passwords come from an environment variable, never an argument. */
export async function runAccountUpdate(
  argv: string[],
  env: Record<string, string | undefined>,
): Promise<CommandResult & { generated?: string }> {
  let values: {
    email?: string | undefined;
    "new-email"?: string | undefined;
    "password-env"?: string | undefined;
    "generate-password"?: boolean | undefined;
  };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        email: { type: "string" },
        "new-email": { type: "string" },
        "password-env": { type: "string" },
        "generate-password": { type: "boolean" },
      },
      strict: true,
    }));
  } catch {
    return { exitCode: 1, message: USAGE };
  }
  if (!values.email || (values["password-env"] && values["generate-password"])) {
    return { exitCode: 1, message: USAGE };
  }
  let newPassword: string | undefined;
  let generated: string | undefined;
  if (values["password-env"]) {
    newPassword = env[values["password-env"]];
    if (!newPassword) {
      return {
        exitCode: 1,
        message: `The environment variable ${values["password-env"]} is empty.`,
      };
    }
  } else if (values["generate-password"]) {
    generated = randomBytes(15).toString("base64url");
    newPassword = generated;
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
    const result = await applyAccountUpdate(
      app.get(PrismaService),
      app.get(PasswordService),
      app.get(AuditService),
      { email: values.email, newEmail: values["new-email"], newPassword },
    );
    return generated && result.exitCode === 0 ? { ...result, generated } : result;
  } finally {
    await app.close();
  }
}
