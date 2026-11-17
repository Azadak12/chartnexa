import type { StaffRole } from "../src/modules/access/index.js";
import type { Harness } from "./auth-helpers.js";

export interface Person {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

/** A signed-in account with a verified email, optionally holding a staff role. */
export async function person(h: Harness, role?: StaffRole, verified = true): Promise<Person> {
  const s = await h.signIn();
  const row = await h.db.session.findUniqueOrThrow({ where: { id: s.sessionId } });
  if (verified) {
    await h.db.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
  }
  if (role) await giveRole(h, row.userId, role);
  return { id: row.userId, ...s };
}

export async function giveRole(h: Harness, userId: string, role: StaffRole): Promise<void> {
  await h.db.userRole.create({ data: { userId, role, reason: "test setup" } });
}

export async function activeRole(h: Harness, userId: string): Promise<string | null> {
  return (await h.db.userRole.findFirst({ where: { userId, revokedAt: null } }))?.role ?? null;
}

/** Ends every Admin role so a test can control exactly who the Admins are. */
export async function clearAdmins(h: Harness, except: string[] = []): Promise<void> {
  await h.db.userRole.updateMany({
    where: { role: "admin", revokedAt: null, userId: { notIn: except } },
    data: { revokedAt: new Date(), revokeReason: "test reset" },
  });
}

export const assign = (
  h: Harness,
  actor: Person,
  targetId: string,
  role: StaffRole,
  reason = "Joining the team",
) =>
  h.call("PUT", `/staff/users/${targetId}/role`, {
    token: actor.accessToken,
    body: { role, reason },
  });

export const revoke = (h: Harness, actor: Person, targetId: string, reason = "Leaving the team") =>
  h.call("POST", `/staff/users/${targetId}/role/revoke`, {
    token: actor.accessToken,
    body: { reason },
  });

export const auditRows = (h: Harness, where: Record<string, unknown> = {}) =>
  h.db.auditEvent.findMany({ where, orderBy: { occurredAt: "asc" } });
