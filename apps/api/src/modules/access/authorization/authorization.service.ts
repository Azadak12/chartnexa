import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { PrismaService } from "../../../database/prisma.service.js";
import { permissionsForRole, type Permission, type Role, type StaffRole } from "./permissions.js";

export interface Access {
  userId: string;
  /** Always contains "student" for an active account; empty for disabled or deleted ones. */
  roles: Role[];
  staffRole: StaffRole | null;
  permissions: ReadonlySet<Permission>;
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
      return { userId, roles: [], staffRole: null, permissions: new Set() };
    }
    const staffRole = user.roles[0]?.role ?? null;
    const roles: Role[] = staffRole ? ["student", staffRole] : ["student"];
    const permissions = new Set<Permission>([...roles].flatMap((r) => permissionsForRole(r)));
    return { userId, roles, staffRole, permissions };
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
   * Role defaults apply to every resource. The resource argument is accepted now so that
   * course-scoped grants (instructor-permission-delegation) can be added here without
   * changing any caller.
   */
  decide(access: Access, permission: Permission, resource?: Resource): boolean {
    void resource; // used once course-scoped grants exist
    return access.permissions.has(permission);
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
