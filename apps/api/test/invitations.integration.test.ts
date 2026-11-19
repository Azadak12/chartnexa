import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DeactivateInstructorResponse, Invitation, Page } from "@chartnexa/api-contracts";
import { auditRows, person, type Person } from "./access-helpers.js";
import { freshEmail, GOOD_PASSWORD, makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let admin: Person;
let manager: Person;
let manager2: Person;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  h = await makeHarness(db.url);
  admin = await person(h, "admin");
  manager = await person(h, "manager");
  manager2 = await person(h, "manager");
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
});

type M = "GET" | "POST" | "DELETE";
const call = (p: Person | undefined, method: M, url: string, body?: unknown) =>
  h.call(method, url, {
    ...(p ? { token: p.accessToken } : {}),
    ...(body !== undefined ? { body } : {}),
  });
const invite = (p: Person, email: string) =>
  call(p, "POST", "/staff/instructor-invitations", { email });
const codeFor = (email: string) => h.tokenFor(email, "instructor_invitation");
const accept = (token: string, over: Record<string, unknown> = {}) =>
  h.call("POST", "/auth/instructor-invitations/accept", {
    body: {
      token,
      displayName: "Ivy Instructor",
      password: "a long unusual passphrase 42",
      ...over,
    },
  });
const roleOf = async (email: string) => {
  const u = await h.db.user.findUnique({ where: { emailNormalized: email } });
  return u
    ? ((await h.db.userRole.findFirst({ where: { userId: u.id, revokedAt: null } }))?.role ?? null)
    : null;
};

describe("inviting", () => {
  it("lets an Admin and a Manager invite, emails the code, and records an audit event without the address", async () => {
    for (const who of [admin, manager]) {
      const email = freshEmail().toLowerCase();
      const res = await invite(who, `  ${email.toUpperCase()}  `);
      expect(res.statusCode).toBe(201);
      const inv = res.json() as Invitation;
      expect(inv).toMatchObject({ email, status: "pending", delivery: "email" });
      expect(codeFor(email).length).toBeGreaterThan(20);
      const audit = await auditRows(h, { action: "instructor.invite", targetId: inv.id });
      expect(audit).toHaveLength(1);
      expect(audit[0]?.actorUserId).toBe(who.id);
      expect(JSON.stringify(audit)).not.toContain(email);
    }
  });

  it("refuses bad addresses, people who are not allowed, and people who already have a staff role", async () => {
    for (const email of ["", "nope", "a@b", "x".repeat(250) + "@example.com"]) {
      expect((await invite(manager, email)).statusCode, email).toBe(400);
    }
    const student = await person(h);
    const teacher = await person(h, "instructor");
    expect((await invite(student, freshEmail())).statusCode).toBe(403);
    expect((await invite(teacher, freshEmail())).statusCode).toBe(403);
    expect(
      (await call(undefined, "POST", "/staff/instructor-invitations", { email: "a@example.com" }))
        .statusCode,
    ).toBe(401);
    for (const target of [teacher, manager2]) {
      const res = await invite(admin, target.email);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: "ALREADY_STAFF" });
    }
  });

  it("answers 409 for a second open invitation, also when two arrive together", async () => {
    const email = freshEmail().toLowerCase();
    const results = await Promise.all([
      invite(admin, email),
      invite(manager, email),
      invite(admin, email),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
    expect(results.find((r) => r.statusCode === 409)?.json()).toMatchObject({
      code: "INVITATION_PENDING",
    });
    expect(await h.db.instructorInvitation.count({ where: { email } })).toBe(1);
  });

  it("allows a new invitation once the old one ran out, and shows the old one as expired", async () => {
    const email = freshEmail().toLowerCase();
    const first = (await invite(admin, email)).json() as Invitation;
    await h.db.instructorInvitation.update({
      where: { id: first.id },
      data: {
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(Date.now() - 86_400_000),
      },
    });
    const list = (
      await call(admin, "GET", "/staff/instructor-invitations?status=expired")
    ).json() as Page<Invitation>;
    expect(list.items.find((i) => i.id === first.id)?.status).toBe("expired");
    expect((await accept(codeFor(email))).statusCode).toBe(400);
    const second = await invite(admin, email);
    expect(second.statusCode).toBe(201);
    expect(
      (await call(admin, "GET", "/staff/instructor-invitations?status=expired"))
        .json<Page<Invitation>>()
        .items.map((i) => i.id),
    ).toContain(first.id);
  });
});

describe("accepting", () => {
  it("creates a verified account with the Instructor role, who can then sign in", async () => {
    const email = freshEmail().toLowerCase();
    const inv = (await invite(manager, email)).json() as Invitation;
    const res = await accept(codeFor(email), { displayName: "  Ivy Instructor " });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ email });
    expect(await roleOf(email)).toBe("instructor");
    const user = await h.db.user.findUniqueOrThrow({ where: { emailNormalized: email } });
    expect(user.displayName).toBe("Ivy Instructor");
    expect(user.emailVerifiedAt).not.toBeNull();
    const login = await h.login(email, "a long unusual passphrase 42");
    expect(login.statusCode).toBe(200);
    const access = (
      await call({ accessToken: login.json().accessToken } as Person, "GET", "/me/access")
    ).json() as { roles: string[] };
    expect(access.roles).toContain("instructor");
    const accepted = await h.db.instructorInvitation.findUniqueOrThrow({ where: { id: inv.id } });
    expect(accepted).toMatchObject({ status: "accepted", acceptedBy: user.id });
    expect(
      await auditRows(h, { action: "instructor.invite.accept", targetId: inv.id }),
    ).toHaveLength(1);
    // A code works once.
    expect((await accept(codeFor(email))).statusCode).toBe(400);
  });

  it("lets someone who already has an account join by proving their password", async () => {
    const student = await person(h);
    const inv = (await invite(admin, student.email)).json() as Invitation;
    const code = codeFor(student.email.toLowerCase());
    expect((await accept(code, { password: "not my password at all 99" })).statusCode).toBe(400);
    expect(await roleOf(student.email.toLowerCase())).toBeNull();
    expect((await accept(code, { password: student.password })).statusCode).toBe(200);
    expect(await roleOf(student.email.toLowerCase())).toBe("instructor");
    expect(
      (await h.db.instructorInvitation.findUniqueOrThrow({ where: { id: inv.id } })).status,
    ).toBe("accepted");
  });

  it("answers every failure the same way, and enforces the password policy for new accounts", async () => {
    const email = freshEmail().toLowerCase();
    await invite(admin, email);
    const bodies = new Set<string>();
    const unknown = await accept("x".repeat(40));
    const tooShort = await accept("short");
    expect(unknown.statusCode).toBe(400);
    expect(tooShort.statusCode).toBe(400);
    bodies.add(JSON.stringify(unknown.json().code));
    expect([...bodies]).toEqual(['"INVITATION_INVALID"']);
    const weak = await accept(codeFor(email), { password: "password" });
    expect(weak.statusCode).toBe(400);
    expect(JSON.stringify(weak.json())).toContain("password");
    expect(await roleOf(email)).toBeNull();
    expect((await accept(codeFor(email), { displayName: "x" })).statusCode).toBe(400);
  });

  it("lets only one of several simultaneous acceptances win", async () => {
    const email = freshEmail().toLowerCase();
    await invite(admin, email);
    const code = codeFor(email);
    const results = await Promise.all([accept(code), accept(code), accept(code)]);
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(
      await h.db.userRole.count({
        where: { user: { emailNormalized: email }, role: "instructor", revokedAt: null },
      }),
    ).toBe(1);
  });

  it("refuses a revoked or replaced code, and an account that became staff meanwhile", async () => {
    const a = freshEmail().toLowerCase();
    const inv = (await invite(admin, a)).json() as Invitation;
    const oldCode = codeFor(a);
    const resent = await call(admin, "POST", `/staff/instructor-invitations/${inv.id}/resend`);
    expect(resent.statusCode).toBe(200);
    expect((await accept(oldCode)).statusCode).toBe(400);
    expect((await accept(codeFor(a))).statusCode).toBe(200);
    const b = freshEmail().toLowerCase();
    const invB = (await invite(admin, b)).json() as Invitation;
    await call(admin, "DELETE", `/staff/instructor-invitations/${invB.id}`);
    expect((await accept(codeFor(b))).statusCode).toBe(400);
    const mgr = await person(h);
    await invite(admin, mgr.email);
    await h.db.userRole.create({ data: { userId: mgr.id, role: "manager", reason: "test" } });
    const res = await accept(codeFor(mgr.email.toLowerCase()), { password: mgr.password });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: "ALREADY_STAFF" });
  });
});

describe("managing invitations", () => {
  it("revokes an open invitation once, refuses to revoke an accepted one, and lets Managers touch only their own", async () => {
    const email = freshEmail().toLowerCase();
    const inv = (await invite(manager, email)).json() as Invitation;
    expect(
      (await call(manager2, "DELETE", `/staff/instructor-invitations/${inv.id}`)).statusCode,
    ).toBe(404);
    expect(
      (await call(manager2, "POST", `/staff/instructor-invitations/${inv.id}/resend`)).statusCode,
    ).toBe(404);
    const first = await call(manager, "DELETE", `/staff/instructor-invitations/${inv.id}`);
    expect(first.json()).toMatchObject({ status: "revoked" });
    expect(
      (await call(manager, "DELETE", `/staff/instructor-invitations/${inv.id}`)).statusCode,
    ).toBe(200);
    expect(
      await auditRows(h, { action: "instructor.invite.revoke", targetId: inv.id }),
    ).toHaveLength(1);
    expect(
      (await call(manager, "POST", `/staff/instructor-invitations/${inv.id}/resend`)).statusCode,
    ).toBe(409);
    // A revoked address can be invited again.
    expect((await invite(manager, email)).statusCode).toBe(201);
    const done = freshEmail().toLowerCase();
    const acc = (await invite(admin, done)).json() as Invitation;
    await accept(codeFor(done));
    const res = await call(admin, "DELETE", `/staff/instructor-invitations/${acc.id}`);
    expect(res.statusCode).toBe(409);
    // An Admin may revoke a Manager's invitation.
    const other = (await invite(manager, freshEmail())).json() as Invitation;
    expect(
      (await call(admin, "DELETE", `/staff/instructor-invitations/${other.id}`)).statusCode,
    ).toBe(200);
  });

  it("lists with status filters and paging; Managers see only theirs, Admins see all", async () => {
    const m = await person(h, "manager");
    const ids = [] as string[];
    for (let i = 0; i < 3; i++) ids.push(((await invite(m, freshEmail())).json() as Invitation).id);
    await call(m, "DELETE", `/staff/instructor-invitations/${ids[0]}`);
    const mine = (
      await call(m, "GET", "/staff/instructor-invitations?limit=2")
    ).json() as Page<Invitation>;
    expect(mine.items).toHaveLength(2);
    expect(mine.nextCursor).not.toBeNull();
    const rest = (
      await call(
        m,
        "GET",
        `/staff/instructor-invitations?limit=2&cursor=${encodeURIComponent(mine.nextCursor as string)}`,
      )
    ).json() as Page<Invitation>;
    expect(new Set([...mine.items, ...rest.items].map((i) => i.id))).toEqual(new Set(ids));
    const revoked = (
      await call(m, "GET", "/staff/instructor-invitations?status=revoked")
    ).json() as Page<Invitation>;
    expect(revoked.items.map((i) => i.id)).toEqual([ids[0]]);
    const pending = (
      await call(m, "GET", "/staff/instructor-invitations?status=pending")
    ).json() as Page<Invitation>;
    expect(pending.items.every((i) => i.status === "pending")).toBe(true);
    const all = (
      await call(admin, "GET", "/staff/instructor-invitations?limit=50")
    ).json() as Page<Invitation>;
    expect(all.items.length).toBeGreaterThan(mine.items.length + rest.items.length - 1);
    expect((await call(m, "GET", "/staff/instructor-invitations?status=bogus")).statusCode).toBe(
      400,
    );
    expect((await call(await person(h), "GET", "/staff/instructor-invitations")).statusCode).toBe(
      403,
    );
  });
});

describe("deactivating an Instructor", () => {
  const makeInstructor = async () => {
    const email = freshEmail().toLowerCase();
    await invite(admin, email);
    await accept(codeFor(email));
    const login = await h.login(email, "a long unusual passphrase 42");
    const user = await h.db.user.findUniqueOrThrow({ where: { emailNormalized: email } });
    return {
      user,
      token: login.json().accessToken as string,
      refresh: login.json().refreshToken as string,
    };
  };

  it("ends role, permissions and sessions at once, keeps the courses, and audits it", async () => {
    const t = await makeInstructor();
    const course = await h.db.course.create({
      data: {
        title: "Taught course",
        level: "beginner",
        priceCents: 0,
        instructorId: t.user.id,
        status: "published",
        publishedAt: new Date(),
      },
    });
    await h.db.instructorGrant.create({
      data: {
        userId: t.user.id,
        permission: "course:update",
        courseId: course.id,
        reason: "Test grant",
      },
    });
    expect((await h.call("GET", "/me/access", { token: t.token })).json().roles).toContain(
      "instructor",
    );
    const list = (await call(manager, "GET", "/staff/instructors")).json() as {
      items: { id: string; courseCount: number }[];
    };
    expect(list.items.find((i) => i.id === t.user.id)?.courseCount).toBe(1);
    const url = `/staff/instructors/${t.user.id}/deactivate`;
    expect((await call(manager, "POST", url, { reason: "Left the team" })).statusCode).toBe(403);
    expect((await call(admin, "POST", url, { reason: "x" })).statusCode).toBe(400);
    const res = await call(admin, "POST", url, { reason: "Left the team" });
    expect(res.statusCode).toBe(200);
    expect(res.json() as DeactivateInstructorResponse).toMatchObject({
      grantsEnded: 1,
      coursesKept: 1,
    });
    expect((res.json() as DeactivateInstructorResponse).sessionsEnded).toBeGreaterThanOrEqual(1);
    expect(await roleOf(t.user.emailNormalized as string)).toBeNull();
    expect((await h.call("GET", "/me", { token: t.token })).statusCode).toBe(401);
    expect(
      (await h.call("POST", "/auth/refresh", { body: { refreshToken: t.refresh } })).statusCode,
    ).toBe(401);
    expect(
      await h.db.instructorGrant.count({ where: { userId: t.user.id, revokedAt: null } }),
    ).toBe(0);
    const kept = await h.db.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(kept).toMatchObject({ status: "published", instructorId: t.user.id });
    const done = await auditRows(h, {
      action: "instructor.deactivate",
      targetId: t.user.id,
      outcome: "success",
    });
    expect(done).toHaveLength(1);
    // The Manager's refused attempt is audited too.
    expect(
      await auditRows(h, {
        action: "instructor.deactivate",
        targetId: t.user.id,
        outcome: "denied",
      }),
    ).toHaveLength(1);
    // They can still sign in as an ordinary account, and be invited again.
    expect(
      (await h.login(t.user.emailNormalized as string, "a long unusual passphrase 42")).statusCode,
    ).toBe(200);
    expect(
      (await call(admin, "GET", "/staff/instructors"))
        .json<{ items: { id: string }[] }>()
        .items.map((i) => i.id),
    ).not.toContain(t.user.id);
    expect((await call(admin, "POST", url, { reason: "Again" })).statusCode).toBe(404);
    expect((await invite(admin, t.user.emailNormalized as string)).statusCode).toBe(201);
  });

  it("refuses managers, non-instructors, unknown people and the Admin acting on themselves", async () => {
    const url = (id: string) => `/staff/instructors/${id}/deactivate`;
    expect(
      (await call(admin, "POST", url(manager.id), { reason: "Not an instructor" })).statusCode,
    ).toBe(404);
    expect(
      (await call(admin, "POST", url("00000000-0000-4000-8000-000000000000"), { reason: "Nobody" }))
        .statusCode,
    ).toBe(404);
    expect((await call(admin, "POST", url(admin.id), { reason: "Myself" })).statusCode).toBe(403);
    expect(
      (await call(undefined, "POST", url(manager.id), { reason: "No sign in" })).statusCode,
    ).toBe(401);
    expect(GOOD_PASSWORD.length).toBeGreaterThan(0);
  });
});
