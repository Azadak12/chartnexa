import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { PrismaService } from "../../../database/prisma.service.js";
import {
  CONFIGURABLE_ROLES,
  permissionsForRole,
  type Permission,
  type Role,
  type StaffRole,
} from "./permissions.js";

export interface Access {
  userId: string;
  /** Always contains "student" for an active account; empty for disabled or deleted ones. */
  roles: Role[];
  staffRole: StaffRole | null;
  /** Role defaults plus academy-wide grants (create course). Course grants are in `grants`. */
  permissions: ReadonlySet<Permission>;
  /** Active course-specific grants of an active Instructor; empty for everyone else. */
  grants: ReadonlyArray<{ permission: Permission; courseId: string }>;
}

export interface DecideOptions {
  /** True for endpoints with no single course (such as a list): any grant of the permission counts. */
  anyCourse?: boolean;
}

export interface Resource {
  courseId?: string;
}

export const FORBIDDEN_MESSAGE = "You do not have permission to do this.";

const requestCache = new WeakMap<object, Map<string, Promise<Access>>>();

@Injectable()
export class AuthorizationService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  /** Current roles and permissions from the database. Disabled and deleted accounts get none. */
  async access(userId: string): Promise<Access> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        roles: { where: { revokedAt: null }, select: { role: true }, take: 1 },
      },
    });
    if (!user || user.status !== "active") {
      return { userId, roles: [], staffRole: null, permissions: new Set(), grants: [] };
    }
    const staffRole = user.roles[0]?.role ?? null;
    const roles: Role[] = staffRole ? ["student", staffRole] : ["student"];
    const now = new Date();
    const [defaults, denials] = await Promise.all([
      this.db.rolePermissionDefault.findMany({
        where: { role: { in: roles.filter((r) => CONFIGURABLE_ROLES.some((c) => c === r)) } },
        select: { role: true, permission: true, enabled: true },
      }),
      this.db.userPermissionDenial.findMany({
        where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { permission: true },
      }),
    ]);
    // Role defaults: the built-in list for each role, overlaid by what an Admin switched.
    const permissions = new Set<Permission>();
    for (const r of roles) {
      const set = new Set<Permission>(permissionsForRole(r));
      for (const d of defaults) {
        if (d.role !== r) continue;
        if (d.enabled) set.add(d.permission as Permission);
        else set.delete(d.permission as Permission);
      }
      for (const p of set) permissions.add(p);
    }
    const grants: Array<{ permission: Permission; courseId: string }> = [];
    // Grants count only while the account is an active Instructor, whatever rows exist, and only
    // until they expire.
    if (staffRole === "instructor") {
      const rows = await this.db.instructorGrant.findMany({
        where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { permission: true, courseId: true },
      });
      for (const g of rows) {
        const permission = g.permission as Permission;
        if (g.courseId === null) permissions.add(permission);
        else grants.push({ permission, courseId: g.courseId });
      }
    }
    // An individual "switched off" wins over the role default and over every grant.
    const off = new Set(denials.map((d) => d.permission));
    for (const p of off) permissions.delete(p as Permission);
    const kept = grants.filter((g) => !off.has(g.permission));
    return { userId, roles, staffRole, permissions, grants: kept };
  }

  /** Same as access() but reads the database once per request however many checks run. */
  accessForRequest(req: FastifyRequest, userId: string): Promise<Access> {
    let perUser = requestCache.get(req);
    if (!perUser) {
      perUser = new Map();
      requestCache.set(req, perUser);
    }
    let hit = perUser.get(userId);
    if (!hit) {
      hit = this.access(userId);
      perUser.set(userId, hit);
    }
    return hit;
  }

  /**
   * Role permissions (and academy-wide grants) apply to every resource. A course grant applies
   * only to the course it names. With `anyCourse`, holding the permission for any course is enough.
   */
  decide(
    access: Access,
    permission: Permission,
    resource?: Resource,
    options: DecideOptions = {},
  ): boolean {
    if (access.permissions.has(permission)) return true;
    if (resource?.courseId) {
      return access.grants.some(
        (g) => g.permission === permission && g.courseId === resource.courseId,
      );
    }
    if (options.anyCourse) return access.grants.some((g) => g.permission === permission);
    return false;
  }

  async can(userId: string, permission: Permission, resource?: Resource): Promise<boolean> {
    return this.decide(await this.access(userId), permission, resource);
  }

  async require(userId: string, permission: Permission, resource?: Resource): Promise<void> {
    if (!(await this.can(userId, permission, resource))) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }
  }
}
