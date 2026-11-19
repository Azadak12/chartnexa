import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  GRANTABLE_PERMISSIONS,
  type Grant,
  type GrantRequest,
  type GrantResponse,
  type GrantablePermission,
  type InstructorPermissionsResponse,
} from "@chartnexa/api-contracts";
import { PrismaService } from "../../../database/prisma.service.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { AuditService } from "../audit/audit.service.js";
import { FORBIDDEN_MESSAGE } from "../authorization/authorization.service.js";

type Tx = Prisma.TransactionClient;

export interface GrantActor {
  userId: string;
  requestId?: string;
}

/**
 * What a Manager may hand out: everything grantable except publishing (proposal R08).
 * Admins may grant everything grantable. This list is the single place to change the ceiling.
 */
export const MANAGER_CEILING: ReadonlySet<GrantablePermission> = new Set(
  (Object.keys(GRANTABLE_PERMISSIONS) as GrantablePermission[]).filter(
    (p) => p !== "course:publish",
  ),
);

/** Given automatically to an Instructor on a course they create (proposal R09). Never publish. */
export const OWNER_AUTO_PERMISSIONS: readonly GrantablePermission[] = [
  "course:update",
  "lesson:upload",
  "live:schedule",
  "assignments:manage",
  "students:read",
  "reports:read",
];

const NOT_INSTRUCTOR_MESSAGE = "This person is not an active Instructor.";
const GRANT_NOT_FOUND_MESSAGE = "That permission was not found or has already been removed.";

type GrantRow = Prisma.InstructorGrantGetPayload<{
  include: { course: { select: { title: true } } };
}>;

function toGrant(r: GrantRow): Grant {
  return {
    id: r.id,
    permission: r.permission as GrantablePermission,
    courseId: r.courseId,
    courseTitle: r.course?.title ?? null,
    source: r.source as "manual" | "owner_auto",
    reason: r.reason,
    grantedAt: r.createdAt.toISOString(),
  };
}

@Injectable()
export class GrantsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** The caller's current staff role, read inside the transaction (closes a revoke race). */
  private async actorRole(tx: Tx, actorId: string): Promise<"admin" | "manager" | null> {
    const u = await tx.user.findUnique({ where: { id: actorId }, select: { status: true } });
    if (u?.status !== "active") return null;
    const r = await tx.userRole.findFirst({ where: { userId: actorId, revokedAt: null } });
    return r?.role === "admin" || r?.role === "manager" ? r.role : null;
  }

  /**
   * Locks the target's active role row (shared) so a role change cannot slip between this
   * check and the write. True only for an active account that is currently an Instructor.
   */
  private async targetIsInstructor(tx: Tx, targetId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ role: string }>>`
      SELECT r.role::text AS role FROM user_roles r JOIN users u ON u.id = r.user_id
      WHERE r.user_id = ${targetId}::uuid AND r.revoked_at IS NULL AND u.status = 'active'
      FOR SHARE OF r`;
    return rows[0]?.role === "instructor";
  }

  private allowedFor(role: "admin" | "manager" | null, p: GrantablePermission): boolean {
    return role === "admin" || (role === "manager" && MANAGER_CEILING.has(p));
  }

  private async deny(
    actor: GrantActor,
    action: string,
    targetId: string,
    reason: string,
    extra: Prisma.InputJsonValue,
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
    throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }

  async list(actorId: string, targetId: string): Promise<InstructorPermissionsResponse> {
    const target = await this.db.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        displayName: true,
        status: true,
        roles: { where: { revokedAt: null }, select: { role: true }, take: 1 },
      },
    });
    if (target?.status !== "active" || target.roles[0]?.role !== "instructor") {
      throw new NotFoundException(NOT_INSTRUCTOR_MESSAGE);
    }
    const actor = await this.db.userRole.findFirst({ where: { userId: actorId, revokedAt: null } });
    const role = actor?.role === "admin" || actor?.role === "manager" ? actor.role : null;
    const rows = await this.db.instructorGrant.findMany({
      where: { userId: targetId, revokedAt: null },
      include: { course: { select: { title: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return {
      userId: target.id,
      displayName: target.displayName,
      grants: rows.map(toGrant),
      grantable: (Object.keys(GRANTABLE_PERMISSIONS) as GrantablePermission[]).map(
        (permission) => ({
          permission,
          scope: GRANTABLE_PERMISSIONS[permission],
          allowedForYou: this.allowedFor(role, permission),
        }),
      ),
    };
  }

  async grant(actor: GrantActor, targetId: string, body: GrantRequest): Promise<GrantResponse> {
    const detail = { permission: body.permission, courseId: body.courseId ?? null };
    if (actor.userId === targetId) {
      return this.deny(actor, "grant.create", targetId, "self_change", detail);
    }
    type Out = { kind: "ok"; id: string; created: boolean } | { kind: "denied"; reason: string };
    const out = await this.db.$transaction<Out>(async (tx) => {
      if (!this.allowedFor(await this.actorRole(tx, actor.userId), body.permission)) {
        return { kind: "denied", reason: "above_ceiling_or_not_authorized" };
      }
      if (!(await this.targetIsInstructor(tx, targetId))) {
        const exists = await tx.user.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!exists) throw new NotFoundException("Account not found.");
        throw new BadRequestException(NOT_INSTRUCTOR_MESSAGE);
      }
      if (body.courseId) {
        const course = await tx.course.findUnique({
          where: { id: body.courseId },
          select: { id: true },
        });
        if (!course) throw new NotFoundException("Course not found.");
      }
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO instructor_grants (id, user_id, permission, course_id, source, granted_by, reason)
        VALUES (gen_random_uuid(), ${targetId}::uuid, ${body.permission}, ${body.courseId ?? null}::uuid,
                'manual', ${actor.userId}::uuid, ${body.reason})
        ON CONFLICT (user_id, permission, (COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid)))
          WHERE revoked_at IS NULL
        DO NOTHING
        RETURNING id`;
      const created = inserted[0];
      if (created) {
        await this.audit.record(tx, {
          actorKind: "user",
          actorUserId: actor.userId,
          action: "grant.create",
          targetType: "user",
          targetId,
          outcome: "success",
          reason: body.reason,
          after: detail,
          requestId: actor.requestId ?? null,
        });
        return { kind: "ok", id: created.id, created: true };
      }
      const existing = await tx.instructorGrant.findFirstOrThrow({
        where: {
          userId: targetId,
          permission: body.permission,
          courseId: body.courseId ?? null,
          revokedAt: null,
        },
        select: { id: true },
      });
      return { kind: "ok", id: existing.id, created: false };
    });
    if (out.kind === "denied")
      return this.deny(actor, "grant.create", targetId, out.reason, detail);
    const row = await this.db.instructorGrant.findUniqueOrThrow({
      where: { id: out.id },
      include: { course: { select: { title: true } } },
    });
    return { grant: toGrant(row), created: out.created };
  }

  async revoke(
    actor: GrantActor,
    targetId: string,
    grantId: string,
    reason: string,
  ): Promise<void> {
    if (actor.userId === targetId) {
      return this.deny(actor, "grant.revoke", targetId, "self_change", { grantId });
    }
    const denied = await this.db.$transaction(async (tx) => {
      if ((await this.actorRole(tx, actor.userId)) === null) return true;
      const ended = await tx.instructorGrant.updateManyAndReturn({
        where: { id: grantId, userId: targetId, revokedAt: null },
        data: { revokedAt: new Date(), revokedBy: actor.userId, revokeReason: reason },
        select: { permission: true, courseId: true },
      });
      const g = ended[0];
      if (!g) throw new NotFoundException(GRANT_NOT_FOUND_MESSAGE);
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actor.userId,
        action: "grant.revoke",
        targetType: "user",
        targetId,
        outcome: "success",
        reason,
        before: { permission: g.permission, courseId: g.courseId },
        requestId: actor.requestId ?? null,
      });
      return false;
    });
    if (denied) return this.deny(actor, "grant.revoke", targetId, "not_authorized", { grantId });
  }

  /** Ends every active grant of a person. Runs inside the caller's transaction. */
  async endAllForUser(
    tx: Tx,
    userId: string,
    actorId: string | null,
    reason: string,
  ): Promise<number> {
    // Take the role row's lock first: a grant in flight holds it shared, so we either wait for
    // that grant to land (and end it) or it waits for us and then sees the role is gone.
    await tx.$queryRaw`SELECT id FROM user_roles WHERE user_id = ${userId}::uuid AND revoked_at IS NULL FOR UPDATE`;
    const ended = await tx.instructorGrant.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: actorId, revokeReason: reason },
    });
    return ended.count;
  }

  /**
   * Runs inside course creation. When the creator is an Instructor, gives them working access
   * to the course they just made (never publishing). No-op for Admins and Managers.
   */
  async grantOwnerAccess(
    tx: Tx,
    userId: string,
    courseId: string,
    requestId: string,
  ): Promise<void> {
    const role = await tx.userRole.findFirst({ where: { userId, revokedAt: null } });
    if (role?.role !== "instructor") return;
    await tx.instructorGrant.createMany({
      data: OWNER_AUTO_PERMISSIONS.map((permission) => ({
        userId,
        permission,
        courseId,
        source: "owner_auto",
        grantedBy: null,
        reason: "Created this course",
      })),
    });
    await this.audit.record(tx, {
      actorKind: "system",
      action: "grant.owner_auto",
      targetType: "course",
      targetId: courseId,
      outcome: "success",
      reason: "Created this course",
      after: { userId, permissions: [...OWNER_AUTO_PERMISSIONS] },
      requestId,
    });
  }
}
