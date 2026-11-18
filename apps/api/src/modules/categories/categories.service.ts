import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  CATEGORY_LIMIT,
  type Category,
  type CreateCategoryRequest,
  type RenameCategoryRequest,
  type StaffCategory,
} from "@chartnexa/api-contracts";
import { PrismaService } from "../../database/prisma.service.js";
import { ValidationFailed } from "../../platform/zod.pipe.js";
import { AuditService } from "../access/index.js";

export interface Actor {
  userId: string;
  requestId?: string | undefined;
}

interface CountRow {
  id: string;
  name: string;
  version: number;
  published: number;
  total: number;
}

const STALE = "This category was changed by someone else. Reload and try again.";
const TAKEN = "A category with this name already exists";
const isUniqueViolation = (e: unknown): boolean =>
  typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Every category with its course counts, in name order, in one query. */
  private async counted(): Promise<CountRow[]> {
    return this.db.$queryRaw<CountRow[]>`
      SELECT c.id, c.name, c.version,
        (count(co.id) FILTER (WHERE co.status = 'published'))::int AS published,
        count(co.id)::int AS total
      FROM categories c LEFT JOIN courses co ON co.category_id = c.id
      GROUP BY c.id ORDER BY lower(c.name), c.id`;
  }

  async listPublic(): Promise<{ items: Category[] }> {
    const rows = await this.counted();
    return { items: rows.map((r) => ({ id: r.id, name: r.name, courseCount: r.published })) };
  }

  async listStaff(): Promise<{ items: StaffCategory[] }> {
    const rows = await this.counted();
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        courseCount: r.published,
        version: r.version,
        totalCourseCount: r.total,
      })),
    };
  }

  private async one(id: string): Promise<StaffCategory> {
    const found = (await this.listStaff()).items.find((c) => c.id === id);
    if (!found) throw new NotFoundException("Category not found.");
    return found;
  }

  async create(actor: Actor, input: CreateCategoryRequest): Promise<StaffCategory> {
    const name = input.name.trim();
    try {
      const id = await this.db.$transaction(async (tx) => {
        // Serialize creates so the limit cannot be passed by simultaneous requests.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('categories:create'))`;
        if ((await tx.category.count()) >= CATEGORY_LIMIT) {
          throw new ConflictException(`There can be at most ${CATEGORY_LIMIT} categories.`);
        }
        const row = await tx.category.create({ data: { name } });
        await this.audit.record(tx, {
          actorKind: "user",
          actorUserId: actor.userId,
          action: "category.create",
          targetType: "category",
          targetId: row.id,
          outcome: "success",
          after: { name: row.name },
          requestId: actor.requestId ?? null,
        });
        return row.id;
      });
      return this.one(id);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ValidationFailed([{ field: "name", message: TAKEN }]);
      throw e;
    }
  }

  async rename(actor: Actor, id: string, input: RenameCategoryRequest): Promise<StaffCategory> {
    const name = input.name.trim();
    try {
      await this.db.$transaction(async (tx) => {
        const current = await tx.category.findUnique({ where: { id } });
        if (!current) throw new NotFoundException("Category not found.");
        if (current.version !== input.expectedVersion) throw new ConflictException(STALE);
        if (current.name === name) return;
        const res = await tx.category.updateMany({
          where: { id, version: input.expectedVersion },
          data: { name, version: { increment: 1 } },
        });
        if (res.count === 0) throw new ConflictException(STALE);
        await this.audit.record(tx, {
          actorKind: "user",
          actorUserId: actor.userId,
          action: "category.rename",
          targetType: "category",
          targetId: id,
          outcome: "success",
          before: { name: current.name },
          after: { name },
          requestId: actor.requestId ?? null,
        });
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ValidationFailed([{ field: "name", message: TAKEN }]);
      throw e;
    }
    return this.one(id);
  }

  /** Only an unused category can go; deleting one that is gone already still succeeds. */
  async remove(actor: Actor, id: string): Promise<{ deleted: boolean }> {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; name: string }[]
      >`SELECT id, name FROM categories WHERE id = ${id}::uuid FOR UPDATE`;
      const current = rows[0];
      if (!current) return { deleted: false };
      const used = await tx.course.count({ where: { categoryId: id } });
      if (used > 0) {
        throw new ConflictException(
          `This category has ${used} ${used === 1 ? "course" : "courses"}. Move them to another category first.`,
        );
      }
      await tx.category.delete({ where: { id } });
      await this.audit.record(tx, {
        actorKind: "user",
        actorUserId: actor.userId,
        action: "category.delete",
        targetType: "category",
        targetId: id,
        outcome: "success",
        before: { name: current.name },
        requestId: actor.requestId ?? null,
      });
      return { deleted: true };
    });
  }
}
