import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  ASSIGNMENT_ATTACHMENT_MAX_BYTES,
  ASSIGNMENT_ERROR_CODES,
  type AssignRequest,
  type AssignResult,
  type AttachmentLink,
  type CreateAssignmentRequest,
  type EnrolledStudent,
  type FeedbackRequest,
  type MyAssignment,
  type MyAssignmentDetail,
  type Recipient,
  type StaffAssignment,
  type StaffSubmission,
  type Submission,
  type SubmissionRequest,
  type UpdateAssignmentRequest,
} from "@chartnexa/api-contracts";
import { CONFIG, type AppConfig } from "../../config/config.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { ValidationFailed } from "../../platform/zod.pipe.js";
import { AuditService } from "../access/index.js";
import {
  OBJECT_STORAGE,
  safeFileName,
  signFileGrant,
  sniffType,
  verifyFileGrant,
  type ObjectStorage,
} from "../resources/index.js";

type Tx = Prisma.TransactionClient;
export interface Actor {
  userId: string;
  requestId?: string | undefined;
}

const NOT_FOUND = "Assignment not found.";
const LIST_LIMIT = 100;
const STUDENT_LIMIT = 500;

type Row = Prisma.AssignmentGetPayload<object>;

const attachmentOf = (r: Row) =>
  r.attachmentKey && r.attachmentName && r.attachmentMime && r.attachmentSize
    ? { name: r.attachmentName, mimeType: r.attachmentMime, sizeBytes: r.attachmentSize }
    : null;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

@Injectable()
export class AssignmentsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private record(tx: Tx, actor: Actor, action: string, id: string, detail: object) {
    return this.audit.record(tx, {
      actorKind: "user",
      actorUserId: actor.userId,
      action,
      targetType: "assignment",
      targetId: id,
      outcome: "success",
      ...detail,
      requestId: actor.requestId ?? null,
    });
  }

  // --- staff: authoring ---------------------------------------------------------------------

  private async checkLesson(courseId: string, lessonId: string | null | undefined): Promise<void> {
    if (!lessonId) return;
    const l = await this.db.lesson.findFirst({
      where: { id: lessonId, courseId },
      select: { id: true },
    });
    if (!l)
      throw new ValidationFailed([
        { field: "lessonId", message: "Choose a lesson of this course" },
      ]);
  }

  private checkDue(dueAt: string | null | undefined): Date | null {
    if (!dueAt) return null;
    const d = new Date(dueAt);
    if (d.getTime() <= Date.now()) {
      throw new ValidationFailed([{ field: "dueAt", message: "Choose a due date in the future" }]);
    }
    return d;
  }

  private async staffView(rows: Row[]): Promise<StaffAssignment[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const counts = await this.db.$queryRaw<
      { id: string; assigned: number; submitted: number; reviewed: number }[]
    >`SELECT a.id,
        (SELECT count(*) FROM assignment_recipients r WHERE r.assignment_id = a.id)::int AS assigned,
        (SELECT count(*) FROM assignment_submissions s WHERE s.assignment_id = a.id)::int AS submitted,
        (SELECT count(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.status = 'reviewed')::int AS reviewed
      FROM assignments a WHERE a.id = ANY(${ids}::uuid[])`;
    const by = new Map(counts.map((c) => [c.id, c]));
    const lessonIds = rows.map((r) => r.lessonId).filter((x): x is string => !!x);
    const lessons = lessonIds.length
      ? await this.db.lesson.findMany({
          where: { id: { in: lessonIds } },
          select: { id: true, title: true },
        })
      : [];
    const titles = new Map(lessons.map((l) => [l.id, l.title]));
    return rows.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      lessonId: r.lessonId,
      lessonTitle: r.lessonId ? (titles.get(r.lessonId) ?? null) : null,
      title: r.title,
      instructions: r.instructions,
      dueAt: iso(r.dueAt),
      status: r.status as "draft" | "published",
      version: r.version,
      attachment: attachmentOf(r),
      createdAt: r.createdAt.toISOString(),
      assignedCount: by.get(r.id)?.assigned ?? 0,
      submittedCount: by.get(r.id)?.submitted ?? 0,
      reviewedCount: by.get(r.id)?.reviewed ?? 0,
    }));
  }

  private async mustFind(
    courseId: string,
    id: string,
    db: Tx | PrismaService = this.db,
  ): Promise<Row> {
    const r = await db.assignment.findFirst({ where: { id, courseId } });
    if (!r) throw new NotFoundException(NOT_FOUND);
    return r;
  }

  async list(courseId: string): Promise<{ items: StaffAssignment[] }> {
    const course = await this.db.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException("Course not found.");
    const rows = await this.db.assignment.findMany({
      where: { courseId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: LIST_LIMIT,
    });
    return { items: await this.staffView(rows) };
  }

  async get(courseId: string, id: string): Promise<StaffAssignment> {
    return (await this.staffView([await this.mustFind(courseId, id)]))[0] as StaffAssignment;
  }

  async create(
    actor: Actor,
    courseId: string,
    input: CreateAssignmentRequest,
  ): Promise<StaffAssignment> {
    const course = await this.db.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException("Course not found.");
    await this.checkLesson(courseId, input.lessonId);
    const dueAt = this.checkDue(input.dueAt);
    const row = await this.db.$transaction(async (tx) => {
      const r = await tx.assignment.create({
        data: {
          courseId,
          lessonId: input.lessonId ?? null,
          title: input.title,
          instructions: input.instructions,
          dueAt,
          status: input.status ?? "draft",
          createdBy: actor.userId,
        },
      });
      await this.record(tx, actor, "assignment.create", r.id, {
        after: { courseId, title: r.title, status: r.status, hasDueDate: dueAt !== null },
      });
      return r;
    });
    return (await this.staffView([row]))[0] as StaffAssignment;
  }

  async update(
    actor: Actor,
    courseId: string,
    id: string,
    input: UpdateAssignmentRequest,
  ): Promise<StaffAssignment> {
    await this.checkLesson(courseId, input.lessonId);
    const dueAt = input.dueAt === undefined ? undefined : this.checkDue(input.dueAt);
    const row = await this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM assignments WHERE id = ${id}::uuid AND course_id = ${courseId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException(NOT_FOUND);
      const cur = await tx.assignment.findUniqueOrThrow({ where: { id } });
      if (cur.version !== input.expectedVersion) {
        throw new ConflictException(
          "This assignment was changed by someone else. Reload it and try again.",
        );
      }
      if (input.status === "draft" && cur.status === "published") {
        const n = await tx.assignmentRecipient.count({ where: { assignmentId: id } });
        if (n > 0) {
          throw new ConflictException({
            message:
              "This assignment is already assigned to students, so it cannot go back to a draft.",
            code: ASSIGNMENT_ERROR_CODES.inUse,
          });
        }
      }
      const changed: string[] = [];
      const data: Prisma.AssignmentUncheckedUpdateInput = {};
      if (input.title !== undefined && input.title !== cur.title)
        ((data.title = input.title), changed.push("title"));
      if (input.instructions !== undefined && input.instructions !== cur.instructions) {
        data.instructions = input.instructions;
        changed.push("instructions");
      }
      if (input.lessonId !== undefined && input.lessonId !== cur.lessonId) {
        data.lessonId = input.lessonId;
        changed.push("lesson");
      }
      if (dueAt !== undefined && dueAt?.getTime() !== cur.dueAt?.getTime()) {
        data.dueAt = dueAt;
        changed.push("dueAt");
      }
      if (input.status !== undefined && input.status !== cur.status) {
        data.status = input.status;
        changed.push("status");
      }
      if (changed.length === 0) return cur;
      const r = await tx.assignment.update({
        where: { id },
        data: { ...data, version: { increment: 1 }, updatedAt: new Date() },
      });
      await this.record(
        tx,
        actor,
        changed.includes("status")
          ? `assignment.${r.status === "published" ? "publish" : "unpublish"}`
          : "assignment.update",
        id,
        {
          before: { status: cur.status },
          after: { status: r.status, changed },
        },
      );
      return r;
    });
    return (await this.staffView([row]))[0] as StaffAssignment;
  }

  // --- staff: attachment ---------------------------------------------------------------------

  async setAttachment(
    actor: Actor,
    courseId: string,
    id: string,
    name: string | undefined,
    body: unknown,
  ): Promise<StaffAssignment> {
    await this.mustFind(courseId, id);
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new ValidationFailed([
        { field: "file", message: "Send the file as application/octet-stream" },
      ]);
    }
    if (body.length > ASSIGNMENT_ATTACHMENT_MAX_BYTES) {
      throw new ValidationFailed([{ field: "file", message: "Use a file of at most 4 MB" }]);
    }
    const mime = sniffType(body);
    if (!mime) {
      throw new ValidationFailed([
        { field: "file", message: "Use a PDF, image, Word or text file" },
      ]);
    }
    const key = `assignments/${courseId}/${randomUUID()}`;
    await this.storage.put(key, body);
    let oldKey: string | null = null;
    let row: Row;
    try {
      row = await this.db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ attachment_key: string | null }[]>`
          SELECT attachment_key FROM assignments WHERE id = ${id}::uuid AND course_id = ${courseId}::uuid FOR UPDATE`;
        if (locked.length === 0) throw new NotFoundException(NOT_FOUND);
        oldKey = locked[0]?.attachment_key ?? null;
        const r = await tx.assignment.update({
          where: { id },
          data: {
            attachmentKey: key,
            attachmentName: safeFileName(name ?? "attachment"),
            attachmentMime: mime,
            attachmentSize: body.length,
            version: { increment: 1 },
            updatedAt: new Date(),
          },
        });
        await this.record(tx, actor, "assignment.attachment.set", id, {
          after: { mime, bytes: body.length },
        });
        return r;
      });
    } catch (e) {
      await this.storage.delete(key);
      throw e;
    }
    if (oldKey) await this.storage.delete(oldKey);
    return (await this.staffView([row]))[0] as StaffAssignment;
  }

  async removeAttachment(actor: Actor, courseId: string, id: string): Promise<StaffAssignment> {
    let oldKey: string | null = null;
    const row = await this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ attachment_key: string | null }[]>`
        SELECT attachment_key FROM assignments WHERE id = ${id}::uuid AND course_id = ${courseId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException(NOT_FOUND);
      oldKey = locked[0]?.attachment_key ?? null;
      if (!oldKey) return tx.assignment.findUniqueOrThrow({ where: { id } });
      const r = await tx.assignment.update({
        where: { id },
        data: {
          attachmentKey: null,
          attachmentName: null,
          attachmentMime: null,
          attachmentSize: null,
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });
      await this.record(tx, actor, "assignment.attachment.remove", id, {});
      return r;
    });
    if (oldKey) await this.storage.delete(oldKey);
    return (await this.staffView([row]))[0] as StaffAssignment;
  }

  private link(assignmentId: string, subject: string): AttachmentLink {
    const expiresAt = Date.now() + this.config.FILE_LINK_TTL_SECONDS * 1000;
    const token = signFileGrant(
      { resourceId: assignmentId, subject, download: true, expiresAt },
      this.config.ACCESS_TOKEN_SECRET,
    );
    return {
      url: `/assignment-files/${assignmentId}?t=${encodeURIComponent(token)}`,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async staffLink(userId: string, courseId: string, id: string): Promise<AttachmentLink> {
    const r = await this.mustFind(courseId, id);
    if (!r.attachmentKey) throw new NotFoundException("This assignment has no attachment.");
    return this.link(id, `staff:${userId}`);
  }

  async studentLink(userId: string, id: string): Promise<AttachmentLink> {
    const r = await this.visible(userId, id);
    if (!r.attachmentKey) throw new NotFoundException("This assignment has no attachment.");
    return this.link(id, userId);
  }

  /** The bytes for a signed link. Students' links stop working once the assignment is withdrawn. */
  async openAttachment(
    id: string,
    token: string,
  ): Promise<{ stream: Readable; mimeType: string; size: number; fileName: string } | null> {
    const grant = verifyFileGrant(token, id, this.config.ACCESS_TOKEN_SECRET);
    if (!grant) return null;
    const r = await this.db.assignment.findUnique({ where: { id } });
    if (!r?.attachmentKey || !r.attachmentMime || !r.attachmentSize || !r.attachmentName)
      return null;
    if (!grant.subject.startsWith("staff:") && r.status !== "published") return null;
    return {
      stream: this.storage.read(r.attachmentKey),
      mimeType: r.attachmentMime,
      size: r.attachmentSize,
      fileName: r.attachmentName,
    };
  }

  // --- staff: assigning and reviewing -------------------------------------------------------

  async enrolled(courseId: string): Promise<{ items: EnrolledStudent[] }> {
    const course = await this.db.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException("Course not found.");
    const rows = await this.db.entitlement.findMany({
      where: { courseId, status: "active" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: STUDENT_LIMIT,
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
    return {
      items: rows.map((e) => ({
        userId: e.user.id,
        displayName: e.user.displayName,
        email: e.user.email,
      })),
    };
  }

  /**
   * Gives a published assignment to students who have active access to the course (all of them,
   * or the chosen ones). Anyone without access makes the whole request fail, so coursework never
   * reaches someone outside the course. Assigning someone twice changes nothing.
   */
  async assign(
    actor: Actor,
    courseId: string,
    id: string,
    input: AssignRequest,
  ): Promise<AssignResult> {
    if (!input.all && (!input.userIds || input.userIds.length === 0)) {
      throw new ValidationFailed([{ field: "userIds", message: "Choose students, or everyone" }]);
    }
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM assignments WHERE id = ${id}::uuid AND course_id = ${courseId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException(NOT_FOUND);
      const a = await tx.assignment.findUniqueOrThrow({ where: { id } });
      if (a.status !== "published") {
        throw new ConflictException({
          message: "Publish the assignment before assigning it.",
          code: ASSIGNMENT_ERROR_CODES.notPublished,
        });
      }
      const active = await tx.entitlement.findMany({
        where: { courseId, status: "active" },
        select: { userId: true },
      });
      const eligible = new Set(active.map((e) => e.userId));
      const targets = input.all ? [...eligible] : [...new Set(input.userIds ?? [])];
      if (targets.some((u) => !eligible.has(u))) {
        throw new ValidationFailed([
          { field: "userIds", message: "Some of these people do not have access to this course" },
        ]);
      }
      const inserted =
        targets.length === 0
          ? []
          : await tx.$queryRaw<{ user_id: string }[]>`
              INSERT INTO assignment_recipients (assignment_id, user_id, assigned_by)
              SELECT ${id}::uuid, u, ${actor.userId}::uuid FROM unnest(${targets}::uuid[]) AS u
              ON CONFLICT DO NOTHING RETURNING user_id`;
      const result = {
        assigned: inserted.length,
        alreadyAssigned: targets.length - inserted.length,
      };
      if (inserted.length > 0) {
        await this.record(tx, actor, "assignment.assign", id, {
          after: { ...result, everyone: input.all === true },
        });
      }
      return result;
    });
  }

  async recipients(courseId: string, id: string): Promise<{ items: Recipient[] }> {
    await this.mustFind(courseId, id);
    const rows = await this.db.assignmentRecipient.findMany({
      where: { assignmentId: id },
      orderBy: [{ assignedAt: "asc" }, { userId: "asc" }],
      take: STUDENT_LIMIT,
      include: {
        user: { select: { displayName: true, email: true } },
        submission: { select: { status: true, late: true, submittedAt: true } },
      },
    });
    return {
      items: rows.map((r) => ({
        userId: r.userId,
        displayName: r.user.displayName,
        email: r.user.email,
        assignedAt: r.assignedAt.toISOString(),
        state: !r.submission
          ? "not_started"
          : r.submission.status === "reviewed"
            ? "reviewed"
            : r.submission.late
              ? "late"
              : "submitted",
        submittedAt: iso(r.submission?.submittedAt ?? null),
      })),
    };
  }

  async submissionOf(courseId: string, id: string, userId: string): Promise<StaffSubmission> {
    await this.mustFind(courseId, id);
    const s = await this.db.assignmentSubmission.findUnique({
      where: { assignmentId_userId: { assignmentId: id, userId } },
      include: { recipient: { select: { user: { select: { displayName: true } } } } },
    });
    if (!s) throw new NotFoundException("No submission yet.");
    return {
      ...this.toSubmission(s),
      userId,
      displayName: s.recipient.user.displayName,
    };
  }

  async giveFeedback(
    actor: Actor,
    courseId: string,
    id: string,
    userId: string,
    input: FeedbackRequest,
  ): Promise<StaffSubmission> {
    await this.mustFind(courseId, id);
    await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ status: string }[]>`
        UPDATE assignment_submissions
        SET feedback = ${input.feedback}, status = 'reviewed', reviewed_by = ${actor.userId}::uuid, reviewed_at = now()
        WHERE assignment_id = ${id}::uuid AND user_id = ${userId}::uuid RETURNING status`;
      if (rows.length === 0) throw new NotFoundException("No submission yet.");
      await this.record(tx, actor, "assignment.feedback", id, {
        after: { studentId: userId, length: input.feedback.length },
      });
    });
    return this.submissionOf(courseId, id, userId);
  }

  // --- students ------------------------------------------------------------------------------

  private visibleWhere(userId: string): Prisma.AssignmentWhereInput {
    return {
      status: "published",
      recipients: { some: { userId } },
      course: { entitlements: { some: { userId, status: "active" } } },
    };
  }

  private async visible(userId: string, id: string) {
    const r = await this.db.assignment.findFirst({
      where: { AND: [{ id }, this.visibleWhere(userId)] },
    });
    if (!r) throw new NotFoundException(NOT_FOUND);
    return r;
  }

  private toSubmission(s: {
    body: string;
    status: string;
    late: boolean;
    submittedAt: Date;
    feedback: string | null;
    reviewedAt: Date | null;
  }): Submission {
    return {
      body: s.body,
      status: s.status as "submitted" | "reviewed",
      late: s.late,
      submittedAt: s.submittedAt.toISOString(),
      feedback: s.feedback,
      reviewedAt: iso(s.reviewedAt),
    };
  }

  private stateOf(s: { status: string; late: boolean } | null | undefined): MyAssignment["state"] {
    if (!s) return "to_do";
    if (s.status === "reviewed") return "reviewed";
    return s.late ? "late" : "submitted";
  }

  async listMine(userId: string): Promise<{ items: MyAssignment[] }> {
    const rows = await this.db.assignment.findMany({
      where: this.visibleWhere(userId),
      take: LIST_LIMIT,
      include: {
        course: { select: { title: true } },
        recipients: { where: { userId }, include: { submission: true } },
      },
    });
    const now = Date.now();
    const items = rows.map((a): MyAssignment => {
      const mine = a.recipients[0];
      const state = this.stateOf(mine?.submission);
      return {
        id: a.id,
        courseId: a.courseId,
        courseTitle: a.course.title,
        title: a.title,
        dueAt: iso(a.dueAt),
        state,
        overdue: state === "to_do" && a.dueAt !== null && a.dueAt.getTime() < now,
        assignedAt: (mine?.assignedAt ?? a.createdAt).toISOString(),
      };
    });
    // Work still to do first (soonest due date first, no date last), then finished work, newest first.
    const rank = (x: MyAssignment) => (x.state === "to_do" ? 0 : 1);
    items.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") ||
        b.assignedAt.localeCompare(a.assignedAt),
    );
    return { items };
  }

  async getMine(userId: string, id: string): Promise<MyAssignmentDetail> {
    const a = await this.db.assignment.findFirst({
      where: { AND: [{ id }, this.visibleWhere(userId)] },
      include: {
        course: { select: { title: true } },
        recipients: { where: { userId }, include: { submission: true } },
      },
    });
    if (!a) throw new NotFoundException(NOT_FOUND);
    const mine = a.recipients[0];
    const state = this.stateOf(mine?.submission);
    return {
      id: a.id,
      courseId: a.courseId,
      courseTitle: a.course.title,
      title: a.title,
      dueAt: iso(a.dueAt),
      state,
      overdue: state === "to_do" && a.dueAt !== null && a.dueAt.getTime() < Date.now(),
      assignedAt: (mine?.assignedAt ?? a.createdAt).toISOString(),
      instructions: a.instructions,
      lessonId: a.lessonId,
      attachment: attachmentOf(a),
      submission: mine?.submission ? this.toSubmission(mine.submission) : null,
    };
  }

  /**
   * Saves a student's answer. They can change it until a reviewer has given feedback; after that
   * it is locked. A change after the due date is marked late.
   */
  async submit(userId: string, id: string, input: SubmissionRequest): Promise<Submission> {
    const a = await this.visible(userId, id);
    const rows = await this.db.$queryRaw<
      {
        body: string;
        status: string;
        late: boolean;
        submitted_at: Date;
        feedback: string | null;
        reviewed_at: Date | null;
      }[]
    >`INSERT INTO assignment_submissions (assignment_id, user_id, body, late)
      VALUES (${id}::uuid, ${userId}::uuid, ${input.body},
        (${a.dueAt}::timestamptz IS NOT NULL AND now() > ${a.dueAt}::timestamptz))
      ON CONFLICT (assignment_id, user_id) DO UPDATE
        SET body = EXCLUDED.body, late = EXCLUDED.late, submitted_at = now()
        WHERE assignment_submissions.status <> 'reviewed'
      RETURNING body, status, late, submitted_at, feedback, reviewed_at`;
    const r = rows[0];
    if (!r) {
      throw new ConflictException({
        message: "This work has been reviewed, so it can no longer change.",
        code: ASSIGNMENT_ERROR_CODES.locked,
      });
    }
    return this.toSubmission({
      body: r.body,
      status: r.status,
      late: r.late,
      submittedAt: r.submitted_at,
      feedback: r.feedback,
      reviewedAt: r.reviewed_at,
    });
  }

  async deleteForAccount(tx: Tx, userId: string): Promise<void> {
    // Submissions go with their recipient rows.
    await tx.assignmentRecipient.deleteMany({ where: { userId } });
  }
}
