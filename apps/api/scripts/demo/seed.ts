import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { INestApplicationContext } from "@nestjs/common";
import { PrismaService } from "../../src/database/prisma.service.js";
import { GrantsService } from "../../src/modules/access/index.js";
import { AnnouncementsService } from "../../src/modules/announcements/index.js";
import { AssignmentsService } from "../../src/modules/assignments/index.js";
import { CoursesService } from "../../src/modules/courses/index.js";
import { PasswordService } from "../../src/modules/identity/index.js";
import { CourseModulesService, LessonsService } from "../../src/modules/lessons/index.js";
import { LiveService } from "../../src/modules/live/index.js";
import { PaymentsService } from "../../src/modules/payments/index.js";
import {
  ResourcesService,
  ThumbnailsService,
  VideoService,
} from "../../src/modules/resources/index.js";
import { ReviewsService } from "../../src/modules/reviews/index.js";
import {
  DEMO_ASSIGNMENTS,
  DEMO_CATEGORIES,
  DEMO_COURSES,
  DEMO_REVIEWERS,
  DEMO_REVIEWS,
  SAMPLE_SUBMISSIONS,
  type DemoCourse,
} from "./content.js";

/** The five test accounts (Instructor and Lecturer are two separate people with the same role). Their passwords are generated on first creation and kept in a local file. */
export const DEMO_ACCOUNTS = [
  { key: "student", email: "student@chartnexa.test", name: "Sam Student", role: null },
  {
    key: "instructor",
    email: "instructor@chartnexa.test",
    name: "Dana Instructor",
    role: "instructor",
  },
  {
    key: "lecturer",
    email: "lecturer@chartnexa.test",
    name: "Lena Lecturer",
    role: "instructor",
  },
  { key: "manager", email: "manager@chartnexa.test", name: "Morgan Manager", role: "manager" },
  { key: "admin", email: "admin@chartnexa.test", name: "Avery Admin", role: "admin" },
] as const;
type AccountKey = (typeof DEMO_ACCOUNTS)[number]["key"];

export interface SeedOptions {
  /** Folder holding thumbnails/, videos/ and pdfs/. */
  assetsDir: string;
  /** Where generated passwords are kept (never committed). */
  credentialsFile: string;
  resetPasswords?: boolean;
  /** Removes the two-step enrolment of demo Admin and Manager so it can be done again. */
  resetMfa?: boolean;
  log?: (line: string) => void;
}

export interface SeedReport {
  courses: number;
  lessons: number;
  videos: number;
  resources: number;
  reviews: number;
  assignments: number;
  createdAccounts: string[];
  passwordsUnknown: string[];
}

interface Credentials {
  note: string;
  accounts: Record<string, { role: string; password: string }>;
}

const REASON = "Demo data";
const requestId = (tag: string) => `demo-seed-${tag}`.slice(0, 60);
const newPassword = () => `${randomBytes(15).toString("base64url")}`;

async function readCredentials(file: string): Promise<Credentials> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Credentials;
    if (parsed && typeof parsed === "object" && parsed.accounts) return parsed;
  } catch {
    // none yet
  }
  return {
    note: "Development demo accounts only. Never commit this file. Regenerate with seed:demo --reset-passwords.",
    accounts: {},
  };
}

/**
 * Fills a development database with a realistic academy: accounts for every role, five complete
 * courses, real uploads through the normal upload services, enrolments, simulated purchases,
 * progress, reviews, assignments, an announcement and a live class. Safe to run repeatedly: every
 * step looks for what already exists first and never deletes anything.
 */
export async function runDemoSeed(
  app: INestApplicationContext,
  opts: SeedOptions,
): Promise<SeedReport> {
  const log = opts.log ?? (() => undefined);
  const db = app.get(PrismaService, { strict: false });
  const passwords = app.get(PasswordService, { strict: false });
  const courseSvc = app.get(CoursesService, { strict: false });
  const modules = app.get(CourseModulesService, { strict: false });
  const lessonSvc = app.get(LessonsService, { strict: false });
  const resources = app.get(ResourcesService, { strict: false });
  const videos = app.get(VideoService, { strict: false });
  const thumbs = app.get(ThumbnailsService, { strict: false });
  const payments = app.get(PaymentsService, { strict: false });
  const reviews = app.get(ReviewsService, { strict: false });
  const grants = app.get(GrantsService, { strict: false });
  const assignments = app.get(AssignmentsService, { strict: false });
  const announcements = app.get(AnnouncementsService, { strict: false });
  const live = app.get(LiveService, { strict: false });

  const report: SeedReport = {
    courses: 0,
    lessons: 0,
    videos: 0,
    resources: 0,
    reviews: 0,
    assignments: 0,
    createdAccounts: [],
    passwordsUnknown: [],
  };
  const asset = (...p: string[]) => readFile(join(opts.assetsDir, ...p));

  // --- accounts ----------------------------------------------------------------------------
  const creds = await readCredentials(opts.credentialsFile);
  const ids = {} as Record<AccountKey, string>;
  for (const a of DEMO_ACCOUNTS) {
    let user = await db.user.findUnique({ where: { emailNormalized: a.email } });
    const known = creds.accounts[a.email]?.password;
    if (!user) {
      const pw = newPassword();
      user = await db.user.create({
        data: {
          email: a.email,
          emailNormalized: a.email,
          displayName: a.name,
          passwordHash: await passwords.hash(pw),
          emailVerifiedAt: new Date(),
        },
      });
      creds.accounts[a.email] = { role: a.role ?? "student", password: pw };
      report.createdAccounts.push(a.email);
    } else if (opts.resetPasswords) {
      const pw = newPassword();
      await db.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await passwords.hash(pw),
          status: "active",
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        },
      });
      await db.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "demo_reset" },
      });
      creds.accounts[a.email] = { role: a.role ?? "student", password: pw };
    } else if (!known) {
      report.passwordsUnknown.push(a.email);
    }
    ids[a.key] = user.id;
    if (a.role) {
      const has = await db.userRole.findFirst({ where: { userId: user.id, revokedAt: null } });
      if (!has) {
        await db.userRole.create({ data: { userId: user.id, role: a.role, reason: "demo seed" } });
        await db.user.update({ where: { id: user.id }, data: { authzVersion: { increment: 1 } } });
      }
    }
    if (opts.resetMfa && (a.role === "admin" || a.role === "manager")) {
      await db.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
      await db.mfaCredential.deleteMany({ where: { userId: user.id } });
    }
  }
  await writeFile(opts.credentialsFile, JSON.stringify(creds, null, 2) + "\n", { mode: 0o600 });
  await chmod(opts.credentialsFile, 0o600);
  log(`accounts ready (${report.createdAccounts.length} new)`);

  // Learners who review and share the classroom. Nobody can sign in as them.
  const learners: string[] = [];
  for (let i = 0; i < DEMO_REVIEWERS.length; i++) {
    const email = `learner${String(i + 1).padStart(2, "0")}@chartnexa.test`;
    let u = await db.user.findUnique({ where: { emailNormalized: email } });
    if (!u) {
      u = await db.user.create({
        data: {
          email,
          emailNormalized: email,
          displayName: DEMO_REVIEWERS[i] as string,
          passwordHash: await passwords.hash(newPassword()),
          emailVerifiedAt: new Date(),
        },
      });
    }
    learners.push(u.id);
  }

  const admin = { userId: ids.admin, requestId: requestId("admin") };
  const teacher = { userId: ids.instructor, requestId: requestId("teacher") };
  const enrol = async (userId: string, courseId: string) => {
    const owned = await db.entitlement.findFirst({ where: { userId, courseId, status: "active" } });
    if (!owned) {
      await db.entitlement.create({
        data: { userId, courseId, source: "admin_grant", grantReason: REASON },
      });
    }
  };

  // --- categories ----------------------------------------------------------------------------
  const categoryIds = new Map<string, string>();
  for (const name of DEMO_CATEGORIES) {
    const c =
      (await db.category.findFirst({ where: { name } })) ??
      (await db.category.create({ data: { name } }));
    categoryIds.set(name, c.id);
  }

  // --- courses with content ----------------------------------------------------------------
  const courseIds = new Map<string, string>();
  const lessonIds = new Map<string, string>(); // `${slug}|${lesson title}` -> id
  for (const dc of DEMO_COURSES) {
    const id = await ensureCourse(dc);
    courseIds.set(dc.slug, id);
    report.courses += 1;
  }

  async function ensureCourse(dc: DemoCourse): Promise<string> {
    let course = await db.course.findFirst({ where: { title: dc.title } });
    if (!course) {
      const made = await courseSvc.create(
        ids.admin,
        {
          title: dc.title,
          description: dc.description,
          level: dc.level,
          priceCents: dc.priceCents,
          coverTone: dc.coverTone,
          categoryId: categoryIds.get(dc.category) ?? null,
        },
        requestId(`course-${dc.slug}`),
      );
      course = await db.course.findUniqueOrThrow({ where: { id: made.id } });
    }
    const courseId = course.id;
    if (course.instructorId !== ids.instructor) {
      await db.course.update({ where: { id: courseId }, data: { instructorId: ids.instructor } });
    }
    let n = 0;
    for (const m of dc.modules) {
      const mod =
        (await db.courseModule.findFirst({ where: { courseId, title: m.title } })) ??
        (await (async () => {
          await modules.create(admin, courseId, { title: m.title });
          return db.courseModule.findFirstOrThrow({ where: { courseId, title: m.title } });
        })());
      for (const l of m.lessons) {
        n += 1;
        let lesson = await db.lesson.findFirst({
          where: { courseId, title: l.title, moduleId: mod.id },
        });
        if (!lesson) {
          const made = await lessonSvc.create(
            ids.admin,
            courseId,
            {
              title: l.title,
              body: l.body,
              isPreview: l.preview === true,
              idempotencyKey: `demo-${dc.slug}-${n}`,
              moduleId: mod.id,
            },
            requestId(`lesson-${dc.slug}-${n}`),
          );
          lesson = await db.lesson.findUniqueOrThrow({ where: { id: made.id } });
        }
        lessonIds.set(`${dc.slug}|${l.title}`, lesson.id);
        report.lessons += 1;
        if (l.video && !(await db.lessonVideo.findUnique({ where: { lessonId: lesson.id } }))) {
          const data = await asset("videos", l.video);
          const s = await videos.startUpload(admin, courseId, lesson.id, {
            fileName: l.video,
            size: data.length,
          });
          await sendParts(courseId, s.uploadId, s.partSize, s.partCount, data);
          await videos.completeUpload(admin, courseId, s.uploadId);
        }
        if (l.video) report.videos += 1;
        if (l.pdf) {
          const have = await db.lessonResource.findFirst({
            where: { lessonId: lesson.id, title: l.pdf.title },
          });
          if (!have) {
            const data = await asset("pdfs", l.pdf.file);
            const s = await resources.start(admin, courseId, lesson.id, {
              fileName: l.pdf.file,
              mimeType: "application/pdf",
              size: data.length,
            });
            await sendParts(courseId, s.uploadId, s.partSize, s.partCount, data);
            await resources.complete(admin, courseId, s.uploadId, {
              title: l.pdf.title,
              downloadable: l.pdf.downloadable,
            });
          }
          report.resources += 1;
        }
      }
    }
    if (!course.thumbnailId) {
      await thumbs.set(admin, courseId, await asset("thumbnails", dc.thumbnail));
    }
    if (course.status === "draft")
      await courseSvc.publish(ids.admin, courseId, requestId(`publish-${dc.slug}`));
    log(`course ready: ${dc.title}`);
    return courseId;
  }

  async function sendParts(
    courseId: string,
    uploadId: string,
    partSize: number,
    count: number,
    data: Buffer,
  ) {
    for (let n = 1; n <= count; n++) {
      await resources.putPart(
        courseId,
        uploadId,
        n,
        data.subarray((n - 1) * partSize, n * partSize),
      );
    }
  }

  // --- the instructor's permissions ---------------------------------------------------------
  const perms = [
    "course:update",
    "lesson:upload",
    "live:schedule",
    "assignments:manage",
    "students:read",
    "reports:read",
  ] as const;
  await grants.grant(admin, ids.instructor, { permission: "course:create", reason: REASON });
  for (const courseId of courseIds.values()) {
    for (const permission of perms)
      await grants.grant(admin, ids.instructor, { permission, courseId, reason: REASON });
  }

  // The Lecturer is a second, separate Instructor: the same role, but permissions only on two
  // courses, so what each person may touch is visibly different.
  await grants.grant(admin, ids.lecturer, { permission: "course:create", reason: REASON });
  for (const slug of ["risk-management-and-psychology", "options-trading-fundamentals"]) {
    const courseId = courseIds.get(slug);
    if (!courseId) continue;
    for (const permission of perms)
      await grants.grant(admin, ids.lecturer, { permission, courseId, reason: REASON });
  }

  // --- the student: two simulated purchases, progress, a review ---------------------------
  const fundamentals = courseIds.get("trading-fundamentals") as string;
  const candles = courseIds.get("candlestick-chart-mastery") as string;
  for (const [slug, courseId] of [
    ["trading-fundamentals", fundamentals],
    ["candlestick-chart-mastery", candles],
  ] as const) {
    try {
      const order = await payments.createOrder(ids.student, courseId, `demo-seed-${slug}`);
      if (order.status === "pending")
        await payments.completeTestCheckout(ids.student, order.checkoutRef, "paid");
    } catch (e) {
      // Already owned from an earlier run: nothing to do.
      if ((e as { response?: { code?: string } }).response?.code !== "ALREADY_OWNED") throw e;
    }
  }
  const lessonOf = (slug: string, title: string) => lessonIds.get(`${slug}|${title}`) as string;
  const done: [string, string, string][] = [
    ["trading-fundamentals", "Understanding Financial Markets", fundamentals],
    ["trading-fundamentals", "How Trading Platforms Work", fundamentals],
    ["trading-fundamentals", "Reading Price Charts", fundamentals],
    ["candlestick-chart-mastery", "Candlestick Anatomy", candles],
    ["candlestick-chart-mastery", "Bullish and Bearish Candles", candles],
  ];
  for (const [slug, title, courseId] of done) {
    await db.lessonCompletion.createMany({
      data: [{ userId: ids.student, lessonId: lessonOf(slug, title), courseId }],
      skipDuplicates: true,
    });
  }
  for (const [slug, title, courseId] of [
    ["trading-fundamentals", "Understanding Financial Markets", fundamentals],
    ["trading-fundamentals", "How Trading Platforms Work", fundamentals],
    ["candlestick-chart-mastery", "Candlestick Anatomy", candles],
  ] as const) {
    await db.videoProgress.upsert({
      where: { userId_lessonId: { userId: ids.student, lessonId: lessonOf(slug, title) } },
      create: {
        userId: ids.student,
        lessonId: lessonOf(slug, title),
        courseId,
        positionSeconds: 15,
        watchedSeconds: 15,
      },
      update: {},
    });
  }
  const mineReview = await db.review.findFirst({
    where: { userId: ids.student, courseId: candles },
  });
  if (!mineReview) {
    await reviews.write(ids.student, candles, {
      rating: 5,
      body: "Clear, practical and honest about how patterns can mislead. The sample charts assignment is a great way to practise.",
    });
  }

  // --- learners' enrolments and reviews ------------------------------------------------------
  for (const dc of DEMO_COURSES) {
    const courseId = courseIds.get(dc.slug) as string;
    for (const [who, rating, body] of DEMO_REVIEWS[dc.slug] ?? []) {
      const userId = learners[who] as string;
      await enrol(userId, courseId);
      if (!(await db.review.findFirst({ where: { userId, courseId } }))) {
        await reviews.write(userId, courseId, { rating, body });
      }
    }
    report.reviews +=
      (DEMO_REVIEWS[dc.slug] ?? []).length + (dc.slug === "candlestick-chart-mastery" ? 1 : 0);
  }
  await enrol(learners[0] as string, fundamentals);
  await enrol(learners[1] as string, fundamentals);

  // --- assignments ---------------------------------------------------------------------------
  const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
  const assignmentIds: Record<string, string> = {};
  for (const [name, def] of Object.entries(DEMO_ASSIGNMENTS)) {
    const courseId = courseIds.get(def.courseSlug) as string;
    let row = await db.assignment.findFirst({ where: { courseId, title: def.title } });
    if (!row) {
      const made = await assignments.create(teacher, courseId, {
        title: def.title,
        instructions: def.instructions,
        lessonId: lessonOf(def.courseSlug, def.lessonTitle),
        dueAt: days(def.dueInDays),
        status: "published",
      });
      await assignments.setAttachment(
        teacher,
        courseId,
        made.id,
        def.attachment,
        await asset("pdfs", def.attachment),
      );
      row = await db.assignment.findUniqueOrThrow({ where: { id: made.id } });
    }
    await assignments.assign(teacher, courseId, row.id, { all: true });
    assignmentIds[name] = row.id;
    report.assignments += 1;
  }
  const submitOnce = async (userId: string, assignmentId: string, text: string) => {
    const has = await db.assignmentSubmission.findUnique({
      where: { assignmentId_userId: { assignmentId, userId } },
    });
    if (!has) await assignments.submit(userId, assignmentId, { body: text });
  };
  const patterns = assignmentIds["patterns"] as string;
  await submitOnce(ids.student, patterns, SAMPLE_SUBMISSIONS.student);
  await submitOnce(learners[0] as string, patterns, SAMPLE_SUBMISSIONS.learner);
  const reviewed = await db.assignmentSubmission.findUnique({
    where: { assignmentId_userId: { assignmentId: patterns, userId: learners[0] as string } },
  });
  if (reviewed && reviewed.status !== "reviewed") {
    await assignments.giveFeedback(teacher, candles, patterns, learners[0] as string, {
      feedback: SAMPLE_SUBMISSIONS.feedback,
    });
  }

  // --- an announcement, a course note and a live class -------------------------------------
  await announcements.publish(admin, {
    title: "Welcome to the ChartNexa Academy demo",
    body: "This is a demonstration academy with sample courses, previews, assignments and a simulated purchase mode. No real payments are taken and the lessons are educational only.",
    idempotencyKey: "demo-welcome-v1",
  });
  await announcements.publish(admin, {
    title: "New sample charts for pattern practice",
    body: "The Identify Chart Patterns assignment now includes four computer-generated sample charts. Open the Assignments tab to begin.",
    courseId: candles,
    idempotencyKey: "demo-sample-charts-v1",
  });
  if (
    !(await db.liveSession.findFirst({
      where: { courseId: fundamentals, title: "Live Q&A: your first week of trading" },
    }))
  ) {
    const start = new Date(Date.now() + 3 * 86_400_000);
    start.setUTCHours(18, 0, 0, 0);
    await live.create(teacher, fundamentals, {
      title: "Live Q&A: your first week of trading",
      description:
        "Bring your questions about platforms, orders and risk. This is a demonstration class: the link is a placeholder.",
      startsAt: start.toISOString(),
      durationMinutes: 45,
      joinUrl: "https://meet.example.com/chartnexa-demo",
    });
  }
  log("demo data ready");
  return report;
}
