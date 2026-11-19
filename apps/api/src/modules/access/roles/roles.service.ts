import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { RoleChangeResponse, UserLookupResponse } from "@chartnexa/api-contracts";
import type { Prisma } from "../../../generated/prisma/client.js";
import { PrismaService } from "../../../database/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { GrantsService } from "../grants/grants.service.js";
import { FORBIDDEN_MESSAGE } from "../authorization/authorization.service.js";
import type { StaffRole } from "../authorization/permissions.js";

type Tx = Prisma.TransactionClient;

export interface Actor {
  userId: string;
  requestId?: string;
}

type Outcome =
  | { kind: "ok"; staffRole: StaffRole | null; changed: boolean }
  | { kind: "denied"; reason: "actor_not_authorized" | "last_admin" | "self_change" };

export const LAST_ADMIN_MESSAGE = "This is the only active Admin. Appoint another Admin first.";

@Injectable()
export class RolesService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(GrantsService) private readonly grants: GrantsService,
  ) {}

  /**
   * Locks every active Admin row in a fixed order so concurrent Admin changes serialize.
   * Rows already revoked by a competing transaction drop out when the lock is granted.
   */
  private async lockActiveAdmins(tx: Tx): Promise<void> {
    await tx.$queryRaw`SELECT id FROM user_roles WHERE role = 'admin' AND revoked_at IS NULL ORDER BY id FOR UPDATE`;
  }

  private countActiveAdmins(tx: Tx): Promise<number> {
    return tx.userRole.count({ where: { role: "admin", revokedAt: null } });
  }

  private async deny(
    actor: Actor,
    action: string,
    targetId: string,
    reason: string,
    extra: Prisma.InputJsonValue = {},
  ): Promise<never> {
    await this.audit.recordDenied({
      actorKind: "user",
      actorUserId: actor.userId,
      action,
      targetType: "user",
      targetId,
      reason,
      after: extra,
      requestId: actor.requestId ?? null,
    });
    if (reason === "last_admin") throw new ConflictException(LAST_ADMIN_MESSAGE);
    throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }

  /** Re-checks, inside the transaction, that the actor is still an active Admin (closes a race). */
  private async actorIsAdmin(tx: Tx, actorId: string): Promise<boolean> {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { status: true } });
    if (actor?.status !== "active") return false;
    return (
      (await tx.userRole.count({ where: { userId: actorId, role: "admin", revokedAt: null } })) > 0
    );
  }

  async assignRole(
    actor: Actor,
    targetId: string,
    role: StaffRole,
    reason: string,
  ): Promise<RoleChangeResponse> {
    if (actor.userId === targetId) {
      return this.deny(actor, "role.assign", targetId, "self_change", { role });
    }
    const outcome = await this.db.$transaction<Outcome>(async (tx) => {
      await this.lockActiveAdmins(tx);
      if (!(await this.actorIsAdmin(tx, actor.userId))) {
        return { kind: "denied", reason: "actor_not_authorized" };
      }
      const target = await tx.user.findUnique({
        where: { id: targetId },
        select: { id: true, status: true, emailVerifiedAt: true },
      });
      if (!target) throw new NotFoundException("Account not found.");
      if (target.status !== "active" || !target.emailVerifiedAt) {
        throw new BadRequestException("This account cannot hold a staff role.");
      }
      const current = await tx.userRole.findFirst({ where: { userId: targetId, revokedAt: null } });
      if (current?.role === role) return { kind: "ok", staffRole: role, changed: false };
      if (current?.role === "admin" && (await this.countActiveAdmins(tx)) <= 1) {
        return { kind: "denied", reason: "last_admin" };
      }
      const now = new Date();
      const grantsEnded =
        current?.role === "instructor"
          ? await this.grants.endAllForUser(tx, targetId, actor.userId, "role_ended")
          : 0;
      if (current) {
        await tx.userRole.update({
          where: { id: current.id },
          data: { revokedAt: now, revokedBy: actor.userId, revokeReason: `replaced: ${reason}` },
        });
      }
      await tx.userRole.create({
        data: { userId: targetId, role, grantedBy: actor.userId, reason },
      });
      // New Managers and Admins sign in again, through the second step.
      if (role === "manager" || role === "admin") {
        await tx.session.updateMany({
          where: { userId: targetId, revokedAt: null },
          data: { revokedAt: now, revokedReason: "staff_role_assigned" },
        });
      }
      await tx.user.update({ where: { id: targetId }, data: { authzVersion: { increment: 1 } } });
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actor.userId,
        action: "role.assign",
        targetType: "user",
        targetId,
        outcome: "success",
        reason,
        before: { role: current?.role ?? null },
        after: { role, grantsEnded },
        requestId: actor.requestId ?? null,
      });
      return { kind: "ok", staffRole: role, changed: true };
    });
    if (outcome.kind === "denied") {
      return this.deny(actor, "role.assign", targetId, outcome.reason, { role });
    }
    return { userId: targetId, staffRole: outcome.staffRole };
  }

  async revokeRole(actor: Actor, targetId: string, reason: string): Promise<RoleChangeResponse> {
    if (actor.userId === targetId) {
      return this.deny(actor, "role.revoke", targetId, "self_change");
    }
    const outcome = await this.db.$transaction<Outcome>(async (tx) => {
      await this.lockActiveAdmins(tx);
      if (!(await this.actorIsAdmin(tx, actor.userId))) {
        return { kind: "denied", reason: "actor_not_authorized" };
      }
      const exists = await tx.user.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!exists) throw new NotFoundException("Account not found.");
      const current = await tx.userRole.findFirst({ where: { userId: targetId, revokedAt: null } });
      if (!current) throw new NotFoundException("This account has no staff role to revoke.");
      if (current.role === "admin" && (await this.countActiveAdmins(tx)) <= 1) {
        return { kind: "denied", reason: "last_admin" };
      }
      const grantsEnded =
        current.role === "instructor"
          ? await this.grants.endAllForUser(tx, targetId, actor.userId, "role_ended")
          : 0;
      await tx.userRole.update({
        where: { id: current.id },
        data: { revokedAt: new Date(), revokedBy: actor.userId, revokeReason: reason },
      });
      await tx.user.update({ where: { id: targetId }, data: { authzVersion: { increment: 1 } } });
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actor.userId,
        action: "role.revoke",
        targetType: "user",
        targetId,
        outcome: "success",
        reason,
        before: { role: current.role },
        after: { role: null, grantsEnded },
        requestId: actor.requestId ?? null,
      });
      return { kind: "ok", staffRole: null, changed: true };
    });
    if (outcome.kind === "denied") return this.deny(actor, "role.revoke", targetId, outcome.reason);
    return { userId: targetId, staffRole: null };
  }

  /**
   * Deactivates an Instructor: the role ends, every course permission ends and every session
   * ends, in one transaction. Nothing is deleted: their courses stay (attributed to them) and
   * the history stays. Repeating it answers 404, because there is no Instructor left.
   */
  async deactivateInstructor(
    actor: Actor,
    targetId: string,
    reason: string,
  ): Promise<{ grantsEnded: number; sessionsEnded: number; coursesKept: number }> {
    if (actor.userId === targetId) {
      return this.deny(actor, "instructor.deactivate", targetId, "self_change");
    }
    const outcome = await this.db.$transaction(async (tx) => {
      await this.lockActiveAdmins(tx);
      if (!(await this.actorIsAdmin(tx, actor.userId))) {
        return { denied: "actor_not_authorized" as const };
      }
      const current = await tx.userRole.findFirst({
        where: { userId: targetId, role: "instructor", revokedAt: null },
      });
      if (!current) throw new NotFoundException("Instructor not found.");
      const now = new Date();
      const grantsEnded = await this.grants.endAllForUser(tx, targetId, actor.userId, "role_ended");
      await tx.userRole.update({
        where: { id: current.id },
        data: { revokedAt: now, revokedBy: actor.userId, revokeReason: reason },
      });
      const sessions = await tx.session.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: now, revokedReason: "instructor_deactivated" },
      });
      await tx.user.update({ where: { id: targetId }, data: { authzVersion: { increment: 1 } } });
      const coursesKept = await tx.course.count({ where: { instructorId: targetId } });
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actor.userId,
        action: "instructor.deactivate",
        targetType: "user",
        targetId,
        outcome: "success",
        reason,
        before: { role: "instructor" },
        after: { role: null, grantsEnded, sessionsEnded: sessions.count, coursesKept },
        requestId: actor.requestId ?? null,
      });
      return { grantsEnded, sessionsEnded: sessions.count, coursesKept };
    });
    if ("denied" in outcome) {
      return this.deny(actor, "instructor.deactivate", targetId, outcome.denied);
    }
    return outcome;
  }

  /**
   * Operator-run. Makes an existing, verified, active account Admin when no Admin exists, or
   * (recovery) regardless. Returns a message for the command line; never throws for rule refusals.
   */
  async bootstrapAdmin(
    email: string,
    options: { recovery: boolean },
  ): Promise<{ ok: boolean; message: string }> {
    const normalized = email.trim().toLowerCase();
    return this.db.$transaction(async (tx) => {
      await this.lockActiveAdmins(tx);
      const user = await tx.user.findUnique({
        where: { emailNormalized: normalized },
        select: { id: true, status: true, emailVerifiedAt: true },
      });
      if (!user || user.status !== "active") {
        return { ok: false, message: "No active account with that email exists." };
      }
      if (!user.emailVerifiedAt) {
        return { ok: false, message: "That account has not verified its email yet." };
      }
      const current = await tx.userRole.findFirst({ where: { userId: user.id, revokedAt: null } });
      if (current?.role === "admin")
        return { ok: true, message: "That account is already an Admin." };
      const admins = await this.countActiveAdmins(tx);
      if (admins > 0 && !options.recovery) {
        return {
          ok: false,
          message: "An active Admin already exists. Use --recovery only if no Admin can sign in.",
        };
      }
      const reason = options.recovery ? "recovery" : "bootstrap";
      if (current?.role === "instructor") {
        await this.grants.endAllForUser(tx, user.id, null, "role_ended");
      }
      if (current) {
        await tx.userRole.update({
          where: { id: current.id },
          data: { revokedAt: new Date(), revokeReason: `replaced: ${reason}` },
        });
      }
      await tx.userRole.create({
        data: { userId: user.id, role: "admin", grantedBy: null, reason },
      });
      await tx.user.update({ where: { id: user.id }, data: { authzVersion: { increment: 1 } } });
      await this.audit.record(tx, {
        actorKind: "system",
        action: options.recovery ? "role.recovery" : "role.bootstrap",
        targetType: "user",
        targetId: user.id,
        outcome: "success",
        reason,
        before: { role: current?.role ?? null },
        after: { role: "admin" },
      });
      return { ok: true, message: `Account ${user.id} is now an Admin (${reason}).` };
    });
  }

  /** Runs inside the account-deletion transaction. */
  async endRoleForDeletion(tx: Tx, userId: string, requestId?: string): Promise<void> {
    await this.lockActiveAdmins(tx);
    const current = await tx.userRole.findFirst({ where: { userId, revokedAt: null } });
    if (!current) return;
    if (current.role === "admin" && (await this.countActiveAdmins(tx)) <= 1) {
      throw new ConflictException(LAST_ADMIN_MESSAGE);
    }
    const grantsEnded =
      current.role === "instructor"
        ? await this.grants.endAllForUser(tx, userId, userId, "account_deleted")
        : 0;
    await tx.userRole.update({
      where: { id: current.id },
      data: { revokedAt: new Date(), revokedBy: userId, revokeReason: "account_deleted" },
    });
    await this.audit.record(tx, {
      actorKind: "user",
      actorUserId: userId,
      action: "role.revoke",
      targetType: "user",
      targetId: userId,
      outcome: "success",
      reason: "account_deleted",
      before: { role: current.role },
      after: { role: null, grantsEnded },
      requestId: requestId ?? null,
    });
  }

  async lookupByEmail(email: string): Promise<UserLookupResponse> {
    const user = await this.db.user.findUnique({
      where: { emailNormalized: email },
      select: {
        id: true,
        displayName: true,
        status: true,
        roles: { where: { revokedAt: null }, select: { role: true }, take: 1 },
      },
    });
    if (!user) throw new NotFoundException("No account with that email.");
    return {
      id: user.id,
      displayName: user.displayName,
      staffRole: user.roles[0]?.role ?? null,
      status: user.status,
    };
  }
}
