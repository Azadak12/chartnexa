import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  INVITATION_ERROR_CODES,
  INVITATION_TTL_HOURS,
  type AcceptInvitationRequest,
  type CreateInvitationRequest,
  type Invitation,
  type InvitationQuery,
  type InvitationStatus,
  type InstructorSummary,
  type Page,
} from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { buildPage, decodeCursor } from "../../pagination/cursor.js";
import { ValidationFailed } from "../../platform/zod.pipe.js";
import { AuditService, AuthorizationService } from "../access/index.js";
import {
  checkPasswordPolicy,
  hashToken,
  newOpaqueToken,
  PasswordService,
  type RequestCtx,
} from "../identity/index.js";
import { MAILER, type Mailer } from "../mailer/index.js";
import { RateLimiterService } from "../rate-limit/index.js";
import { InvalidInvitation } from "./invalid-invitation.js";

type Tx = Prisma.TransactionClient;
export interface Actor {
  userId: string;
  requestId?: string | undefined;
}

const HOUR = 3_600_000;
const INVITES_PER_HOUR = 30;
const DEFAULT_LIMIT = 20;
const row = { inviter: { select: { displayName: true } } } as const;
type Row = Prisma.InstructorInvitationGetPayload<{ include: typeof row }>;

/** Invitation-only Instructor access. The token only ever travels in the email. */
@Injectable()
export class InvitationsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(RateLimiterService) private readonly limiter: RateLimiterService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private status(r: Pick<Row, "status" | "expiresAt">): InvitationStatus {
    return r.status === "pending" && r.expiresAt.getTime() <= Date.now()
      ? "expired"
      : (r.status as InvitationStatus);
  }

  private toInvitation(r: Row, delivery?: "email"): Invitation {
    return {
      id: r.id,
      email: r.email,
      status: this.status(r),
      invitedByName: r.inviter?.displayName ?? null,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      acceptedAt: r.acceptedAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      ...(delivery ? { delivery } : {}),
    };
  }

  private record(tx: Tx, actor: Actor, action: string, id: string, detail: object) {
    return this.audit.record(tx, {
      actorKind: "user",
      actorUserId: actor.userId,
      action,
      targetType: "instructor_invitation",
      targetId: id,
      outcome: "success",
      ...detail,
      requestId: actor.requestId ?? null,
    });
  }

  // --- staff ---------------------------------------------------------------------------------

  async create(actor: Actor, input: CreateInvitationRequest): Promise<Invitation> {
    await this.limiter.consume(`invite:user:${actor.userId}`, INVITES_PER_HOUR, 3600);
    const email = input.email;
    const existing = await this.db.user.findUnique({
      where: { emailNormalized: email },
      select: { id: true, roles: { where: { revokedAt: null }, select: { role: true } } },
    });
    const staffRole = existing?.roles[0]?.role;
    if (staffRole) {
      throw new ConflictException({
        message:
          staffRole === "instructor"
            ? "This person is already an Instructor."
            : "This person already has a staff role.",
        code: INVITATION_ERROR_CODES.alreadyStaff,
      });
    }
    const token = newOpaqueToken();
    const created = await this.db
      .$transaction(async (tx) => {
        // An invitation that ran out is closed first, so a new one can be sent.
        await tx.instructorInvitation.updateMany({
          where: { email, status: "pending", expiresAt: { lte: new Date() } },
          data: { status: "expired" },
        });
        const r = await tx.instructorInvitation.create({
          data: {
            email,
            tokenHash: hashToken(token),
            invitedBy: actor.userId,
            expiresAt: new Date(Date.now() + INVITATION_TTL_HOURS * HOUR),
          },
          include: row,
        });
        await this.record(tx, actor, "instructor.invite", r.id, {
          after: { expiresAt: r.expiresAt.toISOString() },
        });
        return r;
      })
      .catch((e: unknown) => {
        if ((e as { code?: string }).code === "P2002") {
          throw new ConflictException({
            message: "This email already has an open invitation. Resend or revoke it.",
            code: INVITATION_ERROR_CODES.pending,
          });
        }
        throw e;
      });
    await this.mailer.send({ to: email, template: "instructor_invitation", data: { token } });
    return this.toInvitation(created, "email");
  }

  /** A new code and a new expiry for an open invitation; the old code stops working. */
  async resend(actor: Actor, id: string): Promise<Invitation> {
    await this.limiter.consume(`invite:user:${actor.userId}`, INVITES_PER_HOUR, 3600);
    const token = newOpaqueToken();
    const updated = await this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM instructor_invitations WHERE id = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException("Invitation not found.");
      const cur = await tx.instructorInvitation.findUniqueOrThrow({ where: { id } });
      await this.assertMayChange(actor, cur.invitedBy);
      if (cur.status !== "pending") {
        throw new ConflictException({
          message: "Only open invitations can be sent again.",
          code: INVITATION_ERROR_CODES.invalid,
        });
      }
      const r = await tx.instructorInvitation.update({
        where: { id },
        data: {
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + INVITATION_TTL_HOURS * HOUR),
        },
        include: row,
      });
      await this.record(tx, actor, "instructor.invite.resend", id, {
        after: { expiresAt: r.expiresAt.toISOString() },
      });
      return r;
    });
    await this.mailer.send({
      to: updated.email,
      template: "instructor_invitation",
      data: { token },
    });
    return this.toInvitation(updated, "email");
  }

  /** Admins may change any invitation; Managers only the ones they sent. */
  private async assertMayChange(actor: Actor, invitedBy: string | null): Promise<void> {
    if (invitedBy === actor.userId) return;
    if (await this.authz.can(actor.userId, "roles:manage")) return;
    throw new NotFoundException("Invitation not found.");
  }

  async revoke(actor: Actor, id: string): Promise<Invitation> {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM instructor_invitations WHERE id = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException("Invitation not found.");
      const cur = await tx.instructorInvitation.findUniqueOrThrow({ where: { id }, include: row });
      await this.assertMayChange(actor, cur.invitedBy);
      if (cur.status === "revoked") return this.toInvitation(cur);
      if (cur.status !== "pending") {
        throw new ConflictException({
          message:
            cur.status === "accepted"
              ? "This invitation was already accepted."
              : "This invitation is not open.",
          code: INVITATION_ERROR_CODES.invalid,
        });
      }
      const r = await tx.instructorInvitation.update({
        where: { id },
        data: { status: "revoked", revokedAt: new Date(), revokedBy: actor.userId },
        include: row,
      });
      await this.record(tx, actor, "instructor.invite.revoke", id, {
        before: { status: "pending" },
        after: { status: "revoked" },
      });
      return this.toInvitation(r);
    });
  }

  /** Admins see every invitation; Managers see the ones they sent. */
  async list(actor: Actor, q: InvitationQuery): Promise<Page<Invitation>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const all = await this.authz.can(actor.userId, "roles:manage");
    const and: Prisma.InstructorInvitationWhereInput[] = [];
    if (!all) and.push({ invitedBy: actor.userId });
    if (q.status === "expired") {
      and.push({
        OR: [{ status: "expired" }, { status: "pending", expiresAt: { lte: new Date() } }],
      });
    } else if (q.status === "pending") {
      and.push({ status: "pending", expiresAt: { gt: new Date() } });
    } else if (q.status) {
      and.push({ status: q.status });
    }
    if (q.cursor) {
      const [ts, id] = decodeCursor(q.cursor, this.config.CURSOR_SECRET);
      const at = new Date(String(ts));
      and.push({ OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: String(id) } }] });
    }
    const rows = await this.db.instructorInvitation.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: row,
    });
    const page = buildPage(
      rows,
      limit,
      (r) => [r.createdAt.toISOString(), r.id],
      this.config.CURSOR_SECRET,
    );
    return { items: page.items.map((r) => this.toInvitation(r)), nextCursor: page.nextCursor };
  }

  /** Everyone who currently holds the Instructor role, newest first. */
  async listInstructors(): Promise<{ items: InstructorSummary[] }> {
    const roles = await this.db.userRole.findMany({
      where: { role: "instructor", revokedAt: null, user: { status: "active" } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
    const counts = await this.db.course.groupBy({
      by: ["instructorId"],
      where: { instructorId: { in: roles.map((r) => r.userId) } },
      _count: { _all: true },
    });
    const byId = new Map(counts.map((c) => [c.instructorId, c._count._all]));
    return {
      items: roles.map((r) => ({
        id: r.userId,
        displayName: r.user.displayName,
        email: r.user.email,
        since: r.createdAt.toISOString(),
        courseCount: byId.get(r.userId) ?? 0,
      })),
    };
  }

  // --- the invited person --------------------------------------------------------------------

  /**
   * Accepts an invitation. A new person gets an account (the invitation proves their email); a
   * person with an account proves it with their password. Every refusal looks the same, so the
   * answer never reveals whether an account exists.
   */
  async accept(input: AcceptInvitationRequest, ctx: RequestCtx): Promise<{ email: string }> {
    await this.limiter.consume(
      `generic:ip:${ctx.ip}`,
      this.config.RL_GENERIC_IP_MAX,
      this.config.RL_GENERIC_WINDOW_SECONDS,
    );
    const hash = hashToken(input.token);
    const pre = await this.db.instructorInvitation.findUnique({ where: { tokenHash: hash } });
    const open = pre !== null && pre.status === "pending" && pre.expiresAt.getTime() > Date.now();
    const user = open
      ? await this.db.user.findUnique({ where: { emailNormalized: pre.email } })
      : null;
    // Hashing or checking always happens, so timing does not tell the cases apart.
    let passwordHash: string | null = null;
    let passwordOk = false;
    if (user?.passwordHash) {
      passwordOk = await this.passwords.verify(input.password, user.passwordHash);
    } else {
      const policy = checkPasswordPolicy(input.password, pre?.email ?? null);
      if (open && !policy.ok)
        throw new ValidationFailed([{ field: "password", message: policy.message }]);
      passwordHash = await this.passwords.hash(input.password);
    }
    if (!open || (user && (user.status !== "active" || !passwordOk))) throw new InvalidInvitation();

    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM instructor_invitations
        WHERE token_hash = ${hash} AND status = 'pending' AND expires_at > now() FOR UPDATE`;
      if (locked.length === 0) throw new InvalidInvitation();
      const inv = await tx.instructorInvitation.findUniqueOrThrow({ where: { id: locked[0]!.id } });
      let userId: string;
      if (user) {
        const role = await tx.userRole.findFirst({ where: { userId: user.id, revokedAt: null } });
        if (role) {
          throw new ConflictException({
            message: "This account already has a staff role.",
            code: INVITATION_ERROR_CODES.alreadyStaff,
          });
        }
        userId = user.id;
        await tx.user.update({
          where: { id: userId },
          data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
        });
      } else {
        const created = await tx.user.create({
          data: {
            email: inv.email,
            emailNormalized: inv.email,
            passwordHash,
            displayName: input.displayName,
            emailVerifiedAt: new Date(),
          },
        });
        userId = created.id;
      }
      await tx.userRole.create({
        data: { userId, role: "instructor", grantedBy: inv.invitedBy, reason: "invitation" },
      });
      await tx.user.update({ where: { id: userId }, data: { authzVersion: { increment: 1 } } });
      await tx.instructorInvitation.update({
        where: { id: inv.id },
        data: { status: "accepted", acceptedAt: new Date(), acceptedBy: userId },
      });
      await this.audit.record(tx, {
        actorKind: "system",
        action: "instructor.invite.accept",
        targetType: "instructor_invitation",
        targetId: inv.id,
        outcome: "success",
        after: { userId, newAccount: !user },
        requestId: ctx.requestId ?? null,
      });
      return { email: inv.email };
    });
  }
}
