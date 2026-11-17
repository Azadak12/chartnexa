import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { RequestCtx } from "../http/request-context.js";

export type DeletionHook = (
  tx: Prisma.TransactionClient,
  userId: string,
  ctx: RequestCtx,
) => Promise<void>;

/**
 * Lets other modules take part in account deletion without identity depending on them.
 * Hooks run inside the deletion transaction and may veto it by throwing.
 */
@Injectable()
export class AccountDeletionHooks {
  private readonly hooks: DeletionHook[] = [];

  register(hook: DeletionHook): void {
    this.hooks.push(hook);
  }

  async runAll(tx: Prisma.TransactionClient, userId: string, ctx: RequestCtx): Promise<void> {
    for (const hook of this.hooks) await hook(tx, userId, ctx);
  }
}
