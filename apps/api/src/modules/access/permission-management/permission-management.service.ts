import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  RESTRICTED_PERMISSION_LIST,
  catalogEntry,
  type CourseAccessRow,
  type CourseGrantRow,
  type ManagedRole,
  type PermissionRow,
  type PermissionUserDetail,
  type PermissionUsersPage,
  type PermissionUsersQuery,
  type RoleDefaultsEntry,
  type RoleDefaultsResponse,
  type SavePermissionsRequest,
  type SaveRoleDefaultsRequest,
} from "@chartnexa/api-contracts";
import { PrismaService } from "../../../database/prisma.service.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { AuditService } from "../audit/audit.service.js";
import { FORBIDDEN_MESSAGE } from "../authorization/authorization.service.js";
import {
  CONFIGURABLE_ROLES,
  RESTRICTED_PERMISSIONS,
  builtInHolds,
  configurablePermissionsForRole,
  type Permission,
} from "../authorization/permissions.js";
import { GrantsService } from "../grants/grants.service.js";

type Tx = Prisma.TransactionClient;

export interface PermissionActor {
  userId: string;
  requestId?: string;
}

const STALE_MESSAGE =
  "This person's permissions changed since you opened them. Reload and try again.";
const COURSE_LIMIT = 100;
const ACCESS_LIMIT = 50;

/** Thrown inside a transaction (rolling it back); turned into an HTTP error afterwards. */
class Refuse extends Error {
  constructor(
    readonly kind: "forbidden" | "invalid" | "stale" | "missing",
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface Target {
  id: string;
  displayName: string | null;
  email: string | null;
  role: ManagedRole;
  status: string;
  version: number;
}

const isManaged = (r: string | undefined): r is "instructor" | "manager" =>
  r === "instructor" || r === "manager";

/**
 * Admin-only management of individual permissions and role defaults. It adds no second
 * permission system: it writes the instructor grants and role rows that AuthorizationService
 * already reads on every request, so every change (and every revocation) is live at once.
 */
@Injectable()
export class PermissionManagementService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(GrantsService) private readonly grants: GrantsService,
  ) {}

  // ---------- directory ----------

  async users(q: PermissionUsersQuery): Promise<PermissionUsersPage> {
    const text = q.q?.trim();
    const where: Prisma.UserWhereInput = {
      status: "active",
      deletedAt: null,
      ...(q.role === "student"
        ? { roles: { none: { revokedAt: null } } }
        : { roles: { some: { revokedAt: null, role: q.role } } }),
      ...(text
        ? {
            OR: [
              { displayName: { contains: text, mode: "insensitive" } },
              { email: { contains: text, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await this.db.user.findMany({
      where,
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: { id: true, displayName: true, email: true, status: true },
    });
    const page = rows.slice(0, q.limit);
    return {
      items: page.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        role: q.role,
        status: u.status,
      })),
      nextCursor: rows.length > q.limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  // ---------- one person ----------

  private async loadTarget(db: Tx | PrismaService, id: string): Promise<Target> {
    const u = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        deletedAt: true,
        authzVersion: true,
        roles: { where: { revokedAt: null }, select: { role: true }, take: 1 },
      },
    });
    if (!u || u.status !== "active" || u.deletedAt) {
      throw new Refuse("missing", "not_found", "Account not found.");
    }
    const staff = u.roles[0]?.role;
    if (staff === "admin") {
      throw new Refuse("forbidden", "target_admin", "Admin accounts are not managed here.");
    }
    return {
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      role: isManaged(staff) ? staff : "student",
      status: u.status,
      version: u.authzVersion ?? 0,
    };
  }

  private async roleOverrides(db: Tx | PrismaService, role: ManagedRole) {
    const rows = await db.rolePermissionDefault.findMany({
      where: { role: { in: role === "student" ? ["student"] : ["student", role] } },
      select: { role: true, permission: true, enabled: true },
    });
    return rows;
  }

  /** Does the person's role (built-in list plus Admin overrides) give this permission? */
  private roleHolds(
    role: ManagedRole,
    permission: string,
    overrides: Array<{ role: string; permission: string; enabled: boolean }>,
  ): boolean {
    const holder: ManagedRole = permission === "reviews:write" ? "student" : role;
    const o = overrides.find((x) => x.role === holder && x.permission === permission);
    if (o) return o.enabled;
    return builtInHolds(holder, permission as Permission);
  }

  /** Rows the Admin can switch for this person (course permissions of an Instructor are separate). */
  private switchable(role: ManagedRole): string[] {
    if (role === "student") return ["reviews:write"];
    if (role === "instructor") return ["course:create", "reviews:write"];
    return [...configurablePermissionsForRole("manager"), "reviews:write"];
  }

  async detail(id: string): Promise<PermissionUserDetail> {
    let target: Target;
    try {
      target = await this.loadTarget(this.db, id);
    } catch (e) {
      throw this.http(e);
    }
    const now = new Date();
    const [overrides, denials, grantRows, courses, access] = await Promise.all([
      this.roleOverrides(this.db, target.role),
      this.db.userPermissionDenial.findMany({
        where: {
          userId: id,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      target.role === "instructor"
        ? this.db.instructorGrant.findMany({
            where: {
              userId: id,
              revokedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            include: { course: { select: { title: true } } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          })
        : Promise.resolve([]),
      target.role === "instructor"
        ? this.db.course.findMany({
            select: { id: true, title: true },
            orderBy: [{ title: "asc" }, { id: "asc" }],
            take: COURSE_LIMIT,
          })
        : Promise.resolve([]),
      target.role === "student"
        ? this.db.entitlement.findMany({
            where: { userId: id, status: "active" },
            include: { course: { select: { title: true } } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: ACCESS_LIMIT,
          })
        : Promise.resolve([]),
    ]);

    const permissions: PermissionRow[] = this.switchable(target.role).map((permission) => {
      const entry = catalogEntry(permission);
      if (!entry) throw new Error(`Catalog entry missing for ${permission}`);
      const roleDefault = this.roleHolds(target.role, permission, overrides);
      const denial = denials.find((d) => d.permission === permission);
      const grant = grantRows.find((g) => g.permission === permission && g.courseId === null);
      const base = {
        permission,
        label: entry.label,
        help: entry.help,
        scope: entry.scope,
        roleDefault,
      };
      // An individual "on" beyond the role exists only as an Instructor grant (course:create).
      const canGrant = target.role === "instructor" && permission === "course:create";
      const locked = !roleDefault && !canGrant;
      const lockedReason = locked
        ? "Turned off for the whole role. Change it under Role defaults."
        : null;
      if (denial) {
        return {
          ...base,
          enabled: false,
          source: "switched_off" as const,
          expiresAt: denial.expiresAt?.toISOString() ?? null,
          reason: denial.reason,
          changeable: true,
          lockedReason: null,
        };
      }
      if (roleDefault) {
        return {
          ...base,
          enabled: true,
          source: "role" as const,
          expiresAt: null,
          reason: null,
          changeable: true,
          lockedReason: null,
        };
      }
      if (grant) {
        return {
          ...base,
          enabled: true,
          source: "individual" as const,
          expiresAt: grant.expiresAt?.toISOString() ?? null,
          reason: grant.reason,
          changeable: true,
          lockedReason: null,
        };
      }
      return {
        ...base,
        enabled: false,
        source: "none" as const,
        expiresAt: null,
        reason: null,
        changeable: !locked,
        lockedReason,
      };
    });

    const courseGrants: CourseGrantRow[] = grantRows
      .filter((g) => g.courseId !== null)
      .map((g) => ({
        id: g.id,
        permission: g.permission,
        courseId: g.courseId as string,
        courseTitle: g.course?.title ?? "",
        source: g.source as "manual" | "owner_auto",
        reason: g.reason,
        grantedAt: g.createdAt.toISOString(),
        expiresAt: g.expiresAt?.toISOString() ?? null,
      }));
    const courseAccess: CourseAccessRow[] = access.map((e) => ({
      entitlementId: e.id,
      courseId: e.courseId,
      courseTitle: e.course.title,
      source: e.source,
      grantedAt: e.createdAt.toISOString(),
    }));
    return {
      user: {
        id: target.id,
        displayName: target.displayName,
        email: target.email,
        role: target.role,
        status: target.status,
      },
      version: target.version,
      permissions,
      courseGrants,
      availableCourses: courses,
      courseAccess,
      restricted: [...RESTRICTED_PERMISSION_LIST],
    };
  }

  // ---------- save one person ----------

  async save(
    actor: PermissionActor,
    targetId: string,
    body: SavePermissionsRequest,
  ): Promise<PermissionUserDetail> {
    try {
      await this.db.$transaction(async (tx) => {
        await this.requireAdmin(tx, actor.userId);
        if (actor.userId === targetId) {
          throw new Refuse("forbidden", "self_change", FORBIDDEN_MESSAGE);
        }
        // Serialise saves for this person and check what the Admin was looking at.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${targetId}::uuid FOR UPDATE`;
        const target = await this.loadTarget(tx, targetId);
        if (target.version !== body.expectedVersion) {
          throw new Refuse("stale", "stale_version", STALE_MESSAGE);
        }
        const overrides = await this.roleOverrides(tx, target.role);
        let changed = false;
        for (const change of body.changes) {
          if (await this.applyChange(tx, actor, target, overrides, change, body.reason)) {
            changed = true;
          }
        }
        if (changed) {
          await tx.user.update({
            where: { id: targetId },
            data: { authzVersion: { increment: 1 } },
          });
        }
      });
    } catch (e) {
      await this.recordRefusal(actor, "permission.change", "user", targetId, e, body);
      throw this.http(e);
    }
    return this.detail(targetId);
  }

  private async requireAdmin(tx: Tx, actorId: string): Promise<void> {
    const u = await tx.user.findUnique({ where: { id: actorId }, select: { status: true } });
    const r = await tx.userRole.findFirst({ where: { userId: actorId, revokedAt: null } });
    if (u?.status !== "active" || r?.role !== "admin") {
      throw new Refuse("forbidden", "not_admin", FORBIDDEN_MESSAGE);
    }
  }

  private async applyChange(
    tx: Tx,
    actor: PermissionActor,
    target: Target,
    overrides: Array<{ role: string; permission: string; enabled: boolean }>,
    change: SavePermissionsRequest["changes"][number],
    reason: string,
  ): Promise<boolean> {
    const perm = change.permission;
    if ((RESTRICTED_PERMISSIONS as readonly string[]).includes(perm)) {
      throw new Refuse(
        "forbidden",
        "restricted_permission",
        "This permission cannot be changed individually.",
      );
    }
    const entry = catalogEntry(perm);
    if (!entry) throw new Refuse("invalid", "unknown_permission", "Unknown permission.");
    const expiresAt = change.expiresAt ? new Date(change.expiresAt) : null;
    const gActor = actor;

    // Course permissions of an Instructor: only for a named course, never academy-wide.
    if (target.role === "instructor" && entry.scope === "course") {
      if (!change.courseId) {
        throw new Refuse("invalid", "course_required", "Choose the course this applies to.");
      }
      const course = await tx.course.findUnique({
        where: { id: change.courseId },
        select: { id: true },
      });
      if (!course) throw new Refuse("missing", "course_not_found", "Course not found.");
      if (change.enabled) {
        const before = await tx.instructorGrant.count({
          where: {
            userId: target.id,
            permission: perm,
            courseId: change.courseId,
            revokedAt: null,
          },
        });
        const r = await this.grants.insertGrant(tx, gActor, target.id, {
          permission: perm,
          courseId: change.courseId,
          reason,
          expiresAt,
        });
        return r.created || before > 0;
      }
      return this.grants.revokeByKey(tx, gActor, target.id, {
        permission: perm,
        courseId: change.courseId,
        reason,
      });
    }

    // Everything else is a switch on the person (academy-wide).
    if (change.courseId) {
      throw new Refuse(
        "invalid",
        "course_not_allowed",
        "This permission applies to the whole role, not to a single course.",
      );
    }
    if (!this.switchable(target.role).includes(perm)) {
      throw new Refuse("invalid", "not_for_role", "This permission cannot be set for this person.");
    }
    const roleHas = this.roleHolds(target.role, perm, overrides);
    await tx.userPermissionDenial.updateMany({
      where: {
        userId: target.id,
        permission: perm,
        revokedAt: null,
        expiresAt: { lte: new Date() },
      },
      data: { revokedAt: new Date(), revokeReason: "Expired" },
    });
    const denial = await tx.userPermissionDenial.findFirst({
      where: { userId: target.id, permission: perm, revokedAt: null },
    });
    const canGrant = target.role === "instructor" && perm === "course:create";

    if (change.enabled) {
      let changed = false;
      if (denial) {
        await tx.userPermissionDenial.update({
          where: { id: denial.id },
          data: { revokedAt: new Date(), revokedBy: actor.userId, revokeReason: reason },
        });
        await this.auditEvent(tx, actor, "permission.allow", target.id, reason, {
          before: { permission: perm, switchedOff: true },
          after: { permission: perm, switchedOff: false },
        });
        changed = true;
      }
      if (!roleHas) {
        if (!canGrant) {
          throw new Refuse(
            "invalid",
            "role_default_off",
            "Turned off for the whole role. Change it under Role defaults.",
          );
        }
        const had = await tx.instructorGrant.count({
          where: { userId: target.id, permission: perm, courseId: null, revokedAt: null },
        });
        const r = await this.grants.insertGrant(tx, gActor, target.id, {
          permission: perm,
          courseId: null,
          reason,
          expiresAt,
        });
        changed = changed || r.created || had > 0;
      }
      return changed;
    }

    // Switching off.
    let changed = false;
    if (canGrant) {
      changed = await this.grants.revokeByKey(tx, gActor, target.id, {
        permission: perm,
        courseId: null,
        reason,
      });
    }
    if (roleHas && !denial) {
      await tx.userPermissionDenial.create({
        data: { userId: target.id, permission: perm, reason, createdBy: actor.userId, expiresAt },
      });
      await this.auditEvent(tx, actor, "permission.deny", target.id, reason, {
        after: { permission: perm, switchedOff: true, expiresAt: expiresAt?.toISOString() ?? null },
      });
      changed = true;
    } else if (denial && (denial.expiresAt?.getTime() ?? null) !== (expiresAt?.getTime() ?? null)) {
      await tx.userPermissionDenial.update({ where: { id: denial.id }, data: { expiresAt } });
      await this.auditEvent(tx, actor, "permission.deny_expiry_change", target.id, reason, {
        before: { permission: perm, expiresAt: denial.expiresAt?.toISOString() ?? null },
        after: { permission: perm, expiresAt: expiresAt?.toISOString() ?? null },
      });
      changed = true;
    }
    return changed;
  }

  // ---------- role defaults ----------

  async roleDefaults(): Promise<RoleDefaultsResponse> {
    const rows = await this.db.rolePermissionDefault.findMany();
    const roles: RoleDefaultsEntry[] = CONFIGURABLE_ROLES.map((role) => ({
      role,
      permissions: configurablePermissionsForRole(role).map((permission) => {
        const entry = catalogEntry(permission);
        if (!entry) throw new Error(`Catalog entry missing for ${permission}`);
        const builtIn = builtInHolds(role, permission);
        const o = rows.find((r) => r.role === role && r.permission === permission);
        return {
          permission,
          label: entry.label,
          help: entry.help,
          builtIn,
          enabled: o ? o.enabled : builtIn,
        };
      }),
    }));
    return { roles };
  }

  async saveRoleDefaults(
    actor: PermissionActor,
    role: ManagedRole,
    body: SaveRoleDefaultsRequest,
  ): Promise<RoleDefaultsResponse> {
    try {
      await this.db.$transaction(async (tx) => {
        await this.requireAdmin(tx, actor.userId);
        const allowed = configurablePermissionsForRole(role) as string[];
        for (const c of body.changes) {
          if ((RESTRICTED_PERMISSIONS as readonly string[]).includes(c.permission)) {
            throw new Refuse(
              "forbidden",
              "restricted_permission",
              "This permission cannot be changed for a role.",
            );
          }
          if (!allowed.includes(c.permission)) {
            throw new Refuse(
              "invalid",
              "not_for_role",
              "This permission cannot be set for this role.",
            );
          }
          const builtIn = builtInHolds(role, c.permission as Permission);
          const existing = await tx.rolePermissionDefault.findUnique({
            where: { role_permission: { role, permission: c.permission } },
          });
          const before = existing ? existing.enabled : builtIn;
          if (before === c.enabled) continue;
          if (c.enabled === builtIn) {
            await tx.rolePermissionDefault.delete({
              where: { role_permission: { role, permission: c.permission } },
            });
          } else {
            await tx.rolePermissionDefault.upsert({
              where: { role_permission: { role, permission: c.permission } },
              create: {
                role,
                permission: c.permission,
                enabled: c.enabled,
                setBy: actor.userId,
                reason: body.reason,
              },
              update: {
                enabled: c.enabled,
                setBy: actor.userId,
                reason: body.reason,
                updatedAt: new Date(),
              },
            });
          }
          await this.audit.record(tx, {
            actorKind: "user",
            actorUserId: actor.userId,
            action: "role.defaults.update",
            targetType: "role",
            targetId: role,
            outcome: "success",
            reason: body.reason,
            before: { permission: c.permission, enabled: before },
            after: { permission: c.permission, enabled: c.enabled },
            requestId: actor.requestId ?? null,
          });
        }
      });
    } catch (e) {
      await this.recordRefusal(actor, "role.defaults.update", "role", role, e, body);
      throw this.http(e);
    }
    return this.roleDefaults();
  }

  // ---------- helpers ----------

  private async auditEvent(
    tx: Tx,
    actor: PermissionActor,
    action: string,
    targetId: string,
    reason: string,
    state: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue },
  ): Promise<void> {
    await this.audit.record(tx, {
      actorKind: "user",
      actorUserId: actor.userId,
      action,
      targetType: "user",
      targetId,
      outcome: "success",
      reason,
      before: state.before ?? null,
      after: state.after ?? null,
      requestId: actor.requestId ?? null,
    });
  }

  private async recordRefusal(
    actor: PermissionActor,
    action: string,
    targetType: string,
    targetId: string,
    e: unknown,
    body: { changes: Array<{ permission: string }> },
  ): Promise<void> {
    if (!(e instanceof Refuse) || e.kind !== "forbidden") return;
    await this.audit.recordDenied({
      actorKind: "user",
      actorUserId: actor.userId,
      action,
      targetType,
      targetId,
      reason: e.code,
      after: { permissions: body.changes.map((c) => c.permission).slice(0, 40) },
      requestId: actor.requestId ?? null,
    });
  }

  private http(e: unknown): Error {
    if (!(e instanceof Refuse)) return e as Error;
    switch (e.kind) {
      case "forbidden":
        // Restricted permissions get a plain explanation; everything else the generic message.
        return new ForbiddenException(
          e.code === "restricted_permission" ? e.message : FORBIDDEN_MESSAGE,
        );
      case "stale":
        return new ConflictException(e.message);
      case "missing":
        return new NotFoundException(e.message);
      default:
        return new BadRequestException(e.message);
    }
  }
}
