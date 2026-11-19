import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  AssignResult,
  AttachmentLink,
  MyAssignment,
  MyAssignmentDetail,
  Recipient,
  StaffAssignment,
  StaffSubmission,
} from "@chartnexa/api-contracts";
import { CoursesService } from "../src/modules/courses/index.js";
import { auditRows, person, type Person } from "./access-helpers.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let dir: string;
let admin: Person;
let manager: Person;
let courses: CoursesService;

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  dir = await mkdtemp(join(tmpdir(), "chartnexa-assign-"));
  h = await makeHarness(db.url, { STORAGE_DIR: dir });
  courses = h.t.app.get(CoursesService);
  admin = await person(h, "admin");
  manager = await person(h, "manager");
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
  await rm(dir, { recursive: true, force: true });
});

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(50, 1),
]);
const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

type M = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const call = (p: Person | undefined, method: M, url: string, body?: unknown) =>
  h.call(method, url, {
    ...(p ? { token: p.accessToken } : {}),
    ...(body !== undefined ? { body } : {}),
  });
const raw = (p: Person, url: string, data: Buffer) =>
  h.t.app.inject({
    method: "PUT",
    url,
    headers: {
      authorization: `Bearer ${p.accessToken}`,
      "content-type": "application/octet-stream",
    },
    payload: data,
  });
const mkCourse = async () => {
  const c = await courses.create(
    admin.id,
    {
      title: "Coursework course",
      description: "A description.",
      level: "beginner",
      priceCents: 0,
      coverTone: "blue",
    } as never,
    "rq",
  );
  return courses.publish(admin.id, c.id, "rp");
};
const mkLesson = async (courseId: string) =>
  (
    await call(manager, "POST", `/staff/courses/${courseId}/lessons`, {
      title: "Chart reading",
      idempotencyKey: randomUUID(),
    })
  ).json() as { id: string };
const student = async (courseId: string) => {
  const p = await person(h);
  await h.db.entitlement.create({
    data: { userId: p.id, courseId, source: "admin_grant", grantReason: "Test grant" },
  });
  return p;
};
const base = (id: string) => `/staff/courses/${id}/assignments`;
const make = async (
  courseId: string,
  over: Record<string, unknown> = {},
  who: Person = manager,
) => {
  const res = await call(who, "POST", base(courseId), {
    title: "Identify chart patterns",
    instructions: "Describe the patterns you see in the sample chart.",
    ...over,
  });
  return { res, a: res.json() as StaffAssignment };
};
const publish = async (courseId: string, a: StaffAssignment) =>
  (
    await call(manager, "PATCH", `${base(courseId)}/${a.id}`, {
      expectedVersion: a.version,
      status: "published",
    })
  ).json() as StaffAssignment;
const ready = async (courseId: string, over: Record<string, unknown> = {}) =>
  publish(courseId, (await make(courseId, over)).a);
const assignAll = (courseId: string, a: StaffAssignment) =>
  call(manager, "POST", `${base(courseId)}/${a.id}/assign`, { all: true });
const mine = async (p: Person) =>
  (await call(p, "GET", "/me/assignments")).json() as { items: MyAssignment[] };

describe("authoring", () => {
  it("creates a draft, validates input, audits, and refuses lessons of other courses and past due dates", async () => {
    const c = await mkCourse();
    const other = await mkCourse();
    const lesson = await mkLesson(other.id);
    const { res, a } = await make(c.id, { dueAt: days(7) });
    expect(res.statusCode).toBe(201);
    expect(a).toMatchObject({ status: "draft", version: 1, assignedCount: 0, attachment: null });
    expect(await auditRows(h, { action: "assignment.create", targetId: a.id })).toHaveLength(1);
    for (const over of [
      { title: "ab" },
      { title: "x".repeat(121) },
      { instructions: "  " },
      { instructions: "x".repeat(4001) },
      { dueAt: days(-1) },
      { dueAt: "tomorrow" },
      { lessonId: lesson.id },
      { lessonId: "nope" },
      { status: "archived" },
      { extra: 1 },
    ]) {
      expect((await make(c.id, over)).res.statusCode, JSON.stringify(over)).toBe(400);
    }
    const own = await mkLesson(c.id);
    const linked = await make(c.id, { lessonId: own.id });
    expect(linked.a).toMatchObject({ lessonId: own.id, lessonTitle: "Chart reading" });
    expect(
      (
        await call(manager, "POST", base("00000000-0000-4000-8000-000000000000"), {
          title: "Nope here",
          instructions: "x",
        })
      ).statusCode,
    ).toBe(404);
  });

  it("publishes and edits with a version, refuses a stale version, and does not go back to draft once assigned", async () => {
    const c = await mkCourse();
    const { a } = await make(c.id);
    const url = `${base(c.id)}/${a.id}`;
    const pub = (
      await call(manager, "PATCH", url, {
        expectedVersion: 1,
        status: "published",
        title: "Renamed",
      })
    ).json() as StaffAssignment;
    expect(pub).toMatchObject({ status: "published", title: "Renamed", version: 2 });
    expect(
      (await call(manager, "PATCH", url, { expectedVersion: 1, title: "Stale" })).statusCode,
    ).toBe(409);
    expect(await auditRows(h, { action: "assignment.publish", targetId: a.id })).toHaveLength(1);
    const same = (
      await call(manager, "PATCH", url, { expectedVersion: 2, title: "Renamed" })
    ).json() as StaffAssignment;
    expect(same.version).toBe(2);
    const back = await call(manager, "PATCH", url, { expectedVersion: 2, status: "draft" });
    expect(back.statusCode).toBe(200);
    const again = (
      await call(manager, "PATCH", url, { expectedVersion: 3, status: "published" })
    ).json() as StaffAssignment;
    await student(c.id).then(() => assignAll(c.id, again));
    const refused = await call(manager, "PATCH", url, {
      expectedVersion: again.version,
      status: "draft",
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ code: "ASSIGNMENT_IN_USE" });
    const [x, y] = await Promise.all([
      call(manager, "PATCH", url, { expectedVersion: again.version, title: "Title A" }),
      call(admin, "PATCH", url, { expectedVersion: again.version, title: "Title B" }),
    ]);
    expect([x.statusCode, y.statusCode].sort()).toEqual([200, 409]);
  });

  it("lets only holders of assignments:manage for that course author", async () => {
    const c = await mkCourse();
    const other = await mkCourse();
    const teacher = await person(h, "instructor");
    const learner = await student(c.id);
    expect((await make(c.id, {}, learner)).res.statusCode).toBe(403);
    expect((await make(c.id, {}, teacher)).res.statusCode).toBe(403);
    expect((await call(undefined, "GET", base(c.id))).statusCode).toBe(401);
    await h.db.instructorGrant.create({
      data: {
        userId: teacher.id,
        permission: "assignments:manage",
        courseId: c.id,
        reason: "Test grant",
      },
    });
    const { res, a } = await make(c.id, {}, teacher);
    expect(res.statusCode).toBe(201);
    expect((await make(other.id, {}, teacher)).res.statusCode).toBe(403);
    expect((await call(teacher, "GET", `${base(other.id)}/${a.id}`)).statusCode).toBe(403);
    // An assignment is only reachable through its own course.
    expect((await call(manager, "GET", `${base(other.id)}/${a.id}`)).statusCode).toBe(404);
    expect(
      (
        await call(manager, "PATCH", `${base(other.id)}/${a.id}`, {
          expectedVersion: 1,
          title: "Moved",
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe("attachments", () => {
  it("stores a checked file, replaces it without leaving the old one, serves it only through signed links, and removes it", async () => {
    const c = await mkCourse();
    const learner = await student(c.id);
    const a = await ready(c.id);
    const url = `${base(c.id)}/${a.id}/attachment?name=${encodeURIComponent("Sample chart.pdf")}`;
    expect(
      (await raw(manager, url, Buffer.from([0x00, 0x01, 0x02, 0x03, 0xfe, 0xff, 0x10, 0x11])))
        .statusCode,
    ).toBe(400);
    expect((await raw(manager, url, Buffer.alloc(0))).statusCode).toBeGreaterThanOrEqual(400);
    expect(
      (await raw(manager, url, Buffer.concat([PDF, Buffer.alloc(4 * 1024 * 1024)]))).statusCode,
    ).toBe(400);
    const set = await raw(manager, url, PDF);
    expect(set.statusCode).toBe(200);
    expect((set.json() as StaffAssignment).attachment).toEqual({
      name: "Sample chart.pdf",
      mimeType: "application/pdf",
      sizeBytes: PDF.length,
    });
    const keys1 = await readdir(join(dir, "assignments", c.id));
    expect(keys1).toHaveLength(1);
    expect((await raw(manager, `${base(c.id)}/${a.id}/attachment`, PNG)).statusCode).toBe(200);
    const keys2 = await readdir(join(dir, "assignments", c.id));
    expect(keys2).toHaveLength(1);
    expect(keys2[0]).not.toBe(keys1[0]);
    await assignAll(c.id, a);
    const link = (
      await call(learner, "POST", `/me/assignments/${a.id}/attachment-link`)
    ).json() as AttachmentLink;
    const file = await h.t.app.inject({ method: "GET", url: link.url });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("image/png");
    expect(file.headers["content-disposition"]).toContain("attachment");
    expect(file.rawPayload.equals(PNG)).toBe(true);
    expect(
      (await h.t.app.inject({ method: "GET", url: `/assignment-files/${a.id}` })).statusCode,
    ).toBe(404);
    expect(
      (
        await h.t.app.inject({
          method: "GET",
          url: `/assignment-files/${a.id}?t=${"x".repeat(40)}`,
        })
      ).statusCode,
    ).toBe(404);
    // A token for one assignment does not open another.
    const b = await ready(c.id);
    await raw(manager, `${base(c.id)}/${b.id}/attachment`, PDF);
    const other = link.url.replace(a.id, b.id);
    expect((await h.t.app.inject({ method: "GET", url: other })).statusCode).toBe(404);
    const del = () => call(manager, "DELETE", `${base(c.id)}/${a.id}/attachment`);
    expect((await del()).statusCode).toBe(200);
    expect((await del()).statusCode).toBe(200);
    expect((await h.t.app.inject({ method: "GET", url: link.url })).statusCode).toBe(404);
    expect(
      (await call(learner, "POST", `/me/assignments/${a.id}/attachment-link`)).statusCode,
    ).toBe(404);
  });

  it("keeps drafts private from students and gives staff their own link", async () => {
    const c = await mkCourse();
    const learner = await student(c.id);
    const { a } = await make(c.id);
    await raw(manager, `${base(c.id)}/${a.id}/attachment`, PDF);
    const staffLink = (
      await call(manager, "POST", `${base(c.id)}/${a.id}/attachment-link`)
    ).json() as AttachmentLink;
    expect((await h.t.app.inject({ method: "GET", url: staffLink.url })).statusCode).toBe(200);
    expect(
      (await call(learner, "POST", `/me/assignments/${a.id}/attachment-link`)).statusCode,
    ).toBe(404);
    const current = (await call(manager, "GET", `${base(c.id)}/${a.id}`)).json() as StaffAssignment;
    const pub = await publish(c.id, current);
    await assignAll(c.id, pub);
    const studentLink = (
      await call(learner, "POST", `/me/assignments/${a.id}/attachment-link`)
    ).json() as AttachmentLink;
    expect((await h.t.app.inject({ method: "GET", url: studentLink.url })).statusCode).toBe(200);
    // If the assignment is withdrawn some other way, links already handed out stop working.
    await h.db.assignment.update({ where: { id: a.id }, data: { status: "draft" } });
    expect((await h.t.app.inject({ method: "GET", url: studentLink.url })).statusCode).toBe(404);
    expect((await h.t.app.inject({ method: "GET", url: staffLink.url })).statusCode).toBe(200);
  });
});

describe("assigning", () => {
  it("refuses a draft, then assigns everyone with access, and repeating changes nothing", async () => {
    const c = await mkCourse();
    const [s1, s2] = [await student(c.id), await student(c.id)];
    const revoked = await student(c.id);
    await h.db.entitlement.updateMany({
      where: { userId: revoked.id },
      data: { status: "revoked", revokedAt: new Date(), revokeReason: "Test revoke" },
    });
    const { a } = await make(c.id);
    const early = await assignAll(c.id, a);
    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({ code: "ASSIGNMENT_NOT_PUBLISHED" });
    const pub = await publish(c.id, a);
    expect((await assignAll(c.id, pub)).json() as AssignResult).toEqual({
      assigned: 2,
      alreadyAssigned: 0,
    });
    expect((await assignAll(c.id, pub)).json() as AssignResult).toEqual({
      assigned: 0,
      alreadyAssigned: 2,
    });
    expect(await auditRows(h, { action: "assignment.assign", targetId: a.id })).toHaveLength(1);
    expect((await mine(s1)).items.map((i) => i.id)).toEqual([a.id]);
    expect((await mine(s2)).items).toHaveLength(1);
    expect((await mine(revoked)).items).toEqual([]);
    const late = await student(c.id);
    expect((await mine(late)).items).toEqual([]);
    const list = (await call(manager, "GET", base(c.id))).json() as { items: StaffAssignment[] };
    expect(list.items.find((i) => i.id === a.id)).toMatchObject({
      assignedCount: 2,
      submittedCount: 0,
    });
    const enrolled = (
      await call(manager, "GET", `/staff/courses/${c.id}/enrolled-students`)
    ).json() as { items: { userId: string }[] };
    expect(enrolled.items.map((e) => e.userId).sort()).toEqual([s1.id, s2.id, late.id].sort());
  });

  it("assigns chosen students, and refuses the whole request when anyone is outside the course", async () => {
    const c = await mkCourse();
    const other = await mkCourse();
    const [s1, s2] = [await student(c.id), await student(c.id)];
    const outsider = await student(other.id);
    const stranger = await person(h);
    const a = await ready(c.id);
    const url = `${base(c.id)}/${a.id}/assign`;
    for (const body of [
      {},
      { userIds: [] },
      { userIds: ["nope"] },
      { userIds: [s1.id, outsider.id] },
      { userIds: [stranger.id] },
      { all: true, extra: 1 },
    ]) {
      expect((await call(manager, "POST", url, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect(await h.db.assignmentRecipient.count({ where: { assignmentId: a.id } })).toBe(0);
    expect((await call(manager, "POST", url, { userIds: [s1.id, s1.id] })).json()).toEqual({
      assigned: 1,
      alreadyAssigned: 0,
    });
    expect((await mine(s2)).items).toEqual([]);
    expect((await call(manager, "POST", url, { userIds: [s1.id, s2.id] })).json()).toEqual({
      assigned: 1,
      alreadyAssigned: 1,
    });
    expect((await mine(outsider)).items).toEqual([]);
    const rec = (await call(manager, "GET", `${base(c.id)}/${a.id}/recipients`)).json() as {
      items: Recipient[];
    };
    expect(rec.items.map((r) => [r.userId, r.state]).sort()).toEqual(
      [
        [s1.id, "not_started"],
        [s2.id, "not_started"],
      ].sort(),
    );
  });

  it("counts exactly when two staff assign at once", async () => {
    const c = await mkCourse();
    await Promise.all([student(c.id), student(c.id), student(c.id)]);
    const a = await ready(c.id);
    const [x, y] = await Promise.all([assignAll(c.id, a), assignAll(c.id, a)]);
    const total = (x.json() as AssignResult).assigned + (y.json() as AssignResult).assigned;
    expect(total).toBe(3);
    expect(await h.db.assignmentRecipient.count({ where: { assignmentId: a.id } })).toBe(3);
  });
});

describe("the student's side", () => {
  it("shows only assigned, published work for courses they still own, with to-do first and overdue marked", async () => {
    const c = await mkCourse();
    const learner = await student(c.id);
    const soon = await ready(c.id, { title: "Due soon", dueAt: days(2) });
    const later = await ready(c.id, { title: "Due later", dueAt: days(9) });
    const nodate = await ready(c.id, { title: "No date" });
    const hidden = await ready(c.id, { title: "Not assigned to me" });
    await call(manager, "POST", `${base(c.id)}/${hidden.id}/assign`, {
      userIds: [(await student(c.id)).id],
    });
    for (const a of [later, nodate, soon])
      await call(manager, "POST", `${base(c.id)}/${a.id}/assign`, { userIds: [learner.id] });
    const draft = (await make(c.id, { title: "Draft" })).a;
    await h.db.assignmentRecipient.create({ data: { assignmentId: draft.id, userId: learner.id } });
    expect((await mine(learner)).items.map((i) => i.title)).toEqual([
      "Due soon",
      "Due later",
      "No date",
    ]);
    await h.db.assignment.update({
      where: { id: soon.id },
      data: { dueAt: new Date(Date.now() - 1000) },
    });
    const items = (await mine(learner)).items;
    expect(items[0]).toMatchObject({
      title: "Due soon",
      overdue: true,
      state: "to_do",
      courseTitle: "Coursework course",
    });
    expect((await call(learner, "GET", `/me/assignments/${hidden.id}`)).statusCode).toBe(404);
    expect((await call(learner, "GET", `/me/assignments/${draft.id}`)).statusCode).toBe(404);
    expect((await call(undefined, "GET", "/me/assignments")).statusCode).toBe(401);
    await h.db.entitlement.updateMany({
      where: { userId: learner.id },
      data: { status: "revoked", revokedAt: new Date(), revokeReason: "Test revoke" },
    });
    expect((await mine(learner)).items).toEqual([]);
    expect((await call(learner, "GET", `/me/assignments/${later.id}`)).statusCode).toBe(404);
  });

  it("hands in work, lets it change until reviewed, marks lateness, shows feedback, then locks it", async () => {
    const c = await mkCourse();
    const learner = await student(c.id);
    const a = await ready(c.id, { dueAt: days(3) });
    await assignAll(c.id, a);
    const put = (p: Person, body: unknown) =>
      call(p, "PUT", `/me/assignments/${a.id}/submission`, body);
    expect((await put(learner, { body: "  " })).statusCode).toBe(400);
    expect((await put(learner, { body: "x".repeat(5001) })).statusCode).toBe(400);
    expect((await put(await person(h), { body: "Not mine" })).statusCode).toBe(404);
    const first = await put(learner, { body: "I see a double top." });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      status: "submitted",
      late: false,
      body: "I see a double top.",
    });
    const edited = await put(learner, { body: "I see a double top and a breakout." });
    expect(edited.json()).toMatchObject({ body: "I see a double top and a breakout." });
    expect(await h.db.assignmentSubmission.count({ where: { assignmentId: a.id } })).toBe(1);
    expect(
      (await call(learner, "GET", `/me/assignments/${a.id}`)).json() as MyAssignmentDetail,
    ).toMatchObject({
      state: "submitted",
      submission: { body: "I see a double top and a breakout." },
      instructions: "Describe the patterns you see in the sample chart.",
    });
    // After the due date a change is late.
    await h.db.assignment.update({
      where: { id: a.id },
      data: { dueAt: new Date(Date.now() - 1000) },
    });
    expect((await put(learner, { body: "Changed after the deadline." })).json()).toMatchObject({
      late: true,
    });
    expect((await mine(learner)).items[0]).toMatchObject({ state: "late" });
    // Feedback locks the work.
    const fb = `${base(c.id)}/${a.id}/submissions/${learner.id}`;
    expect((await call(manager, "PUT", `${fb}/feedback`, { feedback: "  " })).statusCode).toBe(400);
    const reviewed = (
      await call(manager, "PUT", `${fb}/feedback`, {
        feedback: "Good eye. Mark the neckline next time.",
      })
    ).json() as StaffSubmission;
    expect(reviewed).toMatchObject({
      status: "reviewed",
      userId: learner.id,
      feedback: "Good eye. Mark the neckline next time.",
    });
    expect(await auditRows(h, { action: "assignment.feedback", targetId: a.id })).toHaveLength(1);
    const locked = await put(learner, { body: "One more change." });
    expect(locked.statusCode).toBe(409);
    expect(locked.json()).toMatchObject({ code: "SUBMISSION_LOCKED" });
    const detail = (
      await call(learner, "GET", `/me/assignments/${a.id}`)
    ).json() as MyAssignmentDetail;
    expect(detail).toMatchObject({
      state: "reviewed",
      submission: {
        feedback: "Good eye. Mark the neckline next time.",
        body: "Changed after the deadline.",
      },
    });
    // Feedback can be improved later.
    expect(
      (
        (
          await call(manager, "PUT", `${fb}/feedback`, { feedback: "Updated feedback." })
        ).json() as StaffSubmission
      ).feedback,
    ).toBe("Updated feedback.");
    const list = (await call(manager, "GET", base(c.id))).json() as { items: StaffAssignment[] };
    expect(list.items.find((i) => i.id === a.id)).toMatchObject({
      assignedCount: 1,
      submittedCount: 1,
      reviewedCount: 1,
    });
    const rec = (await call(manager, "GET", `${base(c.id)}/${a.id}/recipients`)).json() as {
      items: Recipient[];
    };
    expect(rec.items[0]).toMatchObject({ state: "reviewed" });
  });

  it("keeps every student's work separate and refuses feedback with nothing handed in", async () => {
    const c = await mkCourse();
    const [s1, s2] = [await student(c.id), await student(c.id)];
    const a = await ready(c.id);
    await assignAll(c.id, a);
    await call(s1, "PUT", `/me/assignments/${a.id}/submission`, {
      body: "Answer from student one",
    });
    await call(s2, "PUT", `/me/assignments/${a.id}/submission`, {
      body: "Answer from student two",
    });
    expect(
      ((await call(s1, "GET", `/me/assignments/${a.id}`)).json() as MyAssignmentDetail).submission
        ?.body,
    ).toBe("Answer from student one");
    expect(
      ((await call(s2, "GET", `/me/assignments/${a.id}`)).json() as MyAssignmentDetail).submission
        ?.body,
    ).toBe("Answer from student two");
    const fb = (u: Person) => `${base(c.id)}/${a.id}/submissions/${u.id}`;
    expect((await call(manager, "GET", fb(s2))).json()).toMatchObject({
      body: "Answer from student two",
      userId: s2.id,
    });
    const s3 = await student(c.id);
    await call(manager, "POST", `${base(c.id)}/${a.id}/assign`, { userIds: [s3.id] });
    expect(
      (await call(manager, "PUT", `${fb(s3)}/feedback`, { feedback: "Nothing yet" })).statusCode,
    ).toBe(404);
    expect((await call(s1, "GET", fb(s2))).statusCode).toBe(403);
  });

  it("settles simultaneous hand-ins into one row", async () => {
    const c = await mkCourse();
    const learner = await student(c.id);
    const a = await ready(c.id);
    await assignAll(c.id, a);
    const results = await Promise.all(
      ["one", "two", "three"].map((t) =>
        call(learner, "PUT", `/me/assignments/${a.id}/submission`, { body: `Answer ${t}` }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(await h.db.assignmentSubmission.count({ where: { assignmentId: a.id } })).toBe(1);
  });

  it("removes a person's coursework with their account", async () => {
    const c = await mkCourse();
    const learner = await student(c.id);
    const a = await ready(c.id);
    await assignAll(c.id, a);
    await call(learner, "PUT", `/me/assignments/${a.id}/submission`, { body: "To be deleted" });
    const res = await h.call("DELETE", "/me", {
      token: learner.accessToken,
      body: { password: learner.password },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(await h.db.assignmentRecipient.count({ where: { userId: learner.id } })).toBe(0);
    expect(await h.db.assignmentSubmission.count({ where: { userId: learner.id } })).toBe(0);
  });
});

describe("the database refuses bad coursework on its own", () => {
  it("rejects bad statuses, lengths, attachments and submissions", async () => {
    const c = await mkCourse();
    const ok = { courseId: c.id, title: "Direct insert", instructions: "Do the thing" };
    for (const over of [
      { status: "archived" },
      { title: "ab" },
      { instructions: "" },
      { version: 0 },
      { attachmentKey: "k" },
      {
        attachmentKey: "k",
        attachmentName: "n",
        attachmentMime: "application/pdf",
        attachmentSize: 5 * 1024 * 1024,
      },
    ]) {
      await expect(
        h.db.assignment.create({ data: { ...ok, ...over } as never }),
        JSON.stringify(over),
      ).rejects.toThrow();
    }
    const a = await h.db.assignment.create({ data: ok });
    const learner = await student(c.id);
    // A submission needs a recipient row first.
    await expect(
      h.db.assignmentSubmission.create({
        data: { assignmentId: a.id, userId: learner.id, body: "x" },
      }),
    ).rejects.toThrow();
    await h.db.assignmentRecipient.create({ data: { assignmentId: a.id, userId: learner.id } });
    for (const over of [
      { body: "" },
      { status: "graded" },
      { status: "reviewed" },
      { feedback: "" },
    ]) {
      await expect(
        h.db.assignmentSubmission.create({
          data: { assignmentId: a.id, userId: learner.id, body: "x", ...over } as never,
        }),
        JSON.stringify(over),
      ).rejects.toThrow();
    }
  });

  it("keeps an assignment when its lesson is deleted, and refuses a lesson from another course", async () => {
    const c = await mkCourse();
    const other = await mkCourse();
    const lesson = await mkLesson(c.id);
    const foreign = await mkLesson(other.id);
    const a = await h.db.assignment.create({
      data: { courseId: c.id, lessonId: lesson.id, title: "Linked", instructions: "x" },
    });
    await expect(
      h.db.assignment.create({
        data: { courseId: c.id, lessonId: foreign.id, title: "Wrong", instructions: "x" },
      }),
    ).rejects.toThrow();
    await call(manager, "DELETE", `/staff/courses/${c.id}/lessons/${lesson.id}`);
    const after = await h.db.assignment.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.lessonId).toBeNull();
    expect(after.courseId).toBe(c.id);
  });
});
