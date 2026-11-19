import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MyAssignment, Page, PublicCourseSummary } from "@chartnexa/api-contracts";
import { DEMO_COURSES, DEMO_ASSIGNMENTS } from "../scripts/demo/content.js";
import { DEMO_ACCOUNTS, runDemoSeed } from "../scripts/demo/seed.js";
import { sniffImage } from "../src/modules/resources/thumbnails.service.js";
import { sniffType } from "../src/modules/resources/index.js";
import { makeHarness, type Harness } from "./auth-helpers.js";
import { createIsolatedDb } from "./isolated-db.js";

let h: Harness;
let drop: () => Promise<void>;
let dir: string;
let credentialsFile: string;
const assetsDir = join(import.meta.dirname, "..", "demo-assets");

beforeAll(async () => {
  const db = await createIsolatedDb();
  drop = db.drop;
  dir = await mkdtemp(join(tmpdir(), "chartnexa-demo-"));
  credentialsFile = join(dir, "creds.json");
  h = await makeHarness(db.url, { STORAGE_DIR: join(dir, "storage") });
});
afterAll(async () => {
  await h.t.app.close();
  await drop();
  await rm(dir, { recursive: true, force: true });
});

const run = (over: { resetPasswords?: boolean } = {}) =>
  runDemoSeed(h.t.app, { assetsDir, credentialsFile, ...over });
const counts = async () => ({
  users: await h.db.user.count(),
  courses: await h.db.course.count(),
  modules: await h.db.courseModule.count(),
  lessons: await h.db.lesson.count(),
  videos: await h.db.lessonVideo.count(),
  resources: await h.db.lessonResource.count(),
  entitlements: await h.db.entitlement.count(),
  orders: await h.db.order.count(),
  reviews: await h.db.review.count(),
  assignments: await h.db.assignment.count(),
  recipients: await h.db.assignmentRecipient.count(),
  submissions: await h.db.assignmentSubmission.count(),
  announcements: await h.db.announcement.count(),
  live: await h.db.liveSession.count(),
  grants: await h.db.instructorGrant.count(),
  completions: await h.db.lessonCompletion.count(),
  categories: await h.db.category.count(),
});
const creds = async () =>
  (
    JSON.parse(await readFile(credentialsFile, "utf8")) as {
      accounts: Record<string, { password: string }>;
    }
  ).accounts;

describe("the demo seed", () => {
  it("creates five complete published courses with real content, and five accounts", async () => {
    const report = await run();
    expect(report).toMatchObject({
      courses: 5,
      lessons: 30,
      videos: 6,
      resources: 6,
      assignments: 2,
    });
    expect(report.createdAccounts).toHaveLength(5);
    const courses = await h.db.course.findMany({
      include: { lessons: true, modules: true, category: true },
    });
    expect(courses).toHaveLength(5);
    for (const c of courses) {
      expect(c.status).toBe("published");
      expect(c.thumbnailId).not.toBeNull();
      expect(c.instructorId).not.toBeNull();
      expect(c.category).not.toBeNull();
      expect(c.lessons).toHaveLength(6);
      expect(c.modules.length).toBeGreaterThanOrEqual(2);
      expect(c.lessons.some((l) => l.isPreview)).toBe(true);
      expect(c.ratingCount).toBeGreaterThanOrEqual(4);
      expect(c.ratingSum / c.ratingCount).toBeGreaterThan(3.5);
      expect(c.priceCents).toBeGreaterThan(0);
    }
    expect(new Set(courses.map((c) => c.level))).toEqual(
      new Set(["beginner", "intermediate", "advanced"]),
    );
    // Every preview lesson has a ready video; one lesson has a paid video.
    const previewIds = courses.flatMap((c) =>
      c.lessons.filter((l) => l.isPreview).map((l) => l.id),
    );
    const videos = await h.db.lessonVideo.findMany();
    expect(videos.every((v) => v.status === "ready" && (v.durationSeconds ?? 0) >= 10)).toBe(true);
    for (const id of previewIds) expect(videos.some((v) => v.lessonId === id)).toBe(true);
    expect(videos.length).toBeGreaterThan(previewIds.length);
  });

  it("changes nothing when run again, and keeps the same passwords", async () => {
    const before = await counts();
    const pw = await creds();
    const report = await run();
    expect(report.createdAccounts).toEqual([]);
    expect(await counts()).toEqual(before);
    expect(await creds()).toEqual(pw);
  });

  it("writes the passwords to an owner-only local file and never into the database in the clear", async () => {
    expect((await stat(credentialsFile)).mode & 0o777).toBe(0o600);
    const pw = await creds();
    expect(Object.keys(pw).sort()).toEqual(DEMO_ACCOUNTS.map((a) => a.email).sort());
    for (const a of Object.values(pw)) expect(a.password.length).toBeGreaterThanOrEqual(16);
    expect(new Set(Object.values(pw).map((a) => a.password)).size).toBe(DEMO_ACCOUNTS.length);
    const hashes = (
      await h.db.user.findMany({ where: { email: { endsWith: "@chartnexa.test" } } })
    ).map((u) => u.passwordHash ?? "");
    for (const a of Object.values(pw))
      expect(hashes.some((x) => x.includes(a.password))).toBe(false);
    expect(hashes.every((x) => x.startsWith("$argon2") || x.length > 40)).toBe(true);
  });

  it("gives each role what it should have, and keeps the second step for Admin and Manager", async () => {
    const pw = await creds();
    const login = (email: string) => h.login(email, pw[email]!.password);
    const student = await login("student@chartnexa.test");
    expect(student.statusCode).toBe(200);
    expect(student.json().accessToken).toBeTruthy();
    const instructor = await login("instructor@chartnexa.test");
    expect(instructor.json().accessToken).toBeTruthy();
    for (const email of ["manager@chartnexa.test", "admin@chartnexa.test"]) {
      const res = await login(email);
      expect(res.statusCode).toBe(200);
      expect(res.json().accessToken, email).toBeUndefined();
      expect(res.json().status).toBe("mfa_setup_required");
    }
    const access = (
      await h.call("GET", "/me/access", { token: instructor.json().accessToken })
    ).json() as {
      roles: string[];
      permissions: string[];
      courseGrants: { permissions: string[] }[];
    };
    expect(access.roles).toContain("instructor");
    expect(access.permissions).toContain("course:create");
    expect(access.courseGrants).toHaveLength(5);
    expect(
      access.courseGrants.every(
        (g) =>
          g.permissions.includes("assignments:manage") && !g.permissions.includes("course:publish"),
      ),
    ).toBe(true);
    const roleOf = async (email: string) =>
      (
        await h.db.userRole.findFirst({
          where: { user: { emailNormalized: email }, revokedAt: null },
        })
      )?.role ?? null;
    expect([
      await roleOf("manager@chartnexa.test"),
      await roleOf("admin@chartnexa.test"),
      await roleOf("student@chartnexa.test"),
    ]).toEqual(["manager", "admin", null]);
    expect(
      (
        await h.call("GET", "/staff/instructor-invitations", {
          token: instructor.json().accessToken,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await h.call("GET", "/staff/audit-events", { token: instructor.json().accessToken }))
        .statusCode,
    ).toBe(403);
  });

  it("gives the student two purchased courses with progress, a review and visible coursework", async () => {
    const pw = await creds();
    const token = (
      await h.login("student@chartnexa.test", pw["student@chartnexa.test"]!.password)
    ).json().accessToken as string;
    const mine = (await h.call("GET", "/me/courses", { token })).json() as {
      items: { title: string; progress: { completed: number; total: number } }[];
    };
    expect(mine.items.map((c) => [c.title, c.progress.completed, c.progress.total]).sort()).toEqual(
      [
        ["Candlestick Chart Mastery", 2, 6],
        ["Trading Fundamentals", 3, 6],
      ],
    );
    const orders = (await h.call("GET", "/me/orders", { token })).json() as {
      items: { status: string; testMode: boolean }[];
    };
    expect(orders.items).toHaveLength(2);
    expect(orders.items.every((o) => o.status === "paid" && o.testMode)).toBe(true);
    const asg = (await h.call("GET", "/me/assignments", { token })).json() as {
      items: MyAssignment[];
    };
    expect(asg.items.map((a) => [a.title, a.state])).toEqual([
      ["Create a Risk Management Plan", "to_do"],
      ["Identify Chart Patterns", "submitted"],
    ]);
    const review = await h.db.review.findFirst({
      where: { user: { emailNormalized: "student@chartnexa.test" } },
    });
    expect(review?.rating).toBe(5);
    const next = (await h.call("GET", "/me/continue-learning", { token })).json() as {
      item: { nextLessonTitle: string };
    };
    expect(next.item.nextLessonTitle).toBeTruthy();
    // The student does not own the other three courses, so the simulated purchase is offered.
    const list = (await h.call("GET", "/courses?limit=20")).json() as Page<PublicCourseSummary>;
    expect(list.items).toHaveLength(5);
    expect(
      list.items.every((c) => c.thumbnailUrl && c.instructor?.displayName && c.categoryName),
    ).toBe(true);
    // Another learner's reviewed work shows feedback; the sample chart assignment is attached.
    const feedback = await h.db.assignmentSubmission.findMany({ where: { status: "reviewed" } });
    expect(feedback).toHaveLength(1);
    expect(
      (await h.db.assignment.findMany()).every(
        (a) => a.attachmentKey !== null && a.status === "published",
      ),
    ).toBe(true);
  });

  it("resets passwords only when asked, and signs the old ones out", async () => {
    const before = await creds();
    const token = (
      await h.login("student@chartnexa.test", before["student@chartnexa.test"]!.password)
    ).json().accessToken as string;
    await run({ resetPasswords: true });
    const after = await creds();
    expect(after["student@chartnexa.test"]!.password).not.toBe(
      before["student@chartnexa.test"]!.password,
    );
    expect((await h.call("GET", "/me", { token })).statusCode).toBe(401);
    expect(
      (await h.login("student@chartnexa.test", before["student@chartnexa.test"]!.password))
        .statusCode,
    ).toBe(401);
    expect(
      (await h.login("student@chartnexa.test", after["student@chartnexa.test"]!.password))
        .statusCode,
    ).toBe(200);
  });
});

describe("safety of the seed command", () => {
  const cli = (env: Record<string, string>) =>
    spawnSync("pnpm", ["exec", "tsx", "scripts/seed-demo.ts"], {
      cwd: join(import.meta.dirname, ".."),
      encoding: "utf8",
      env: { PATH: process.env["PATH"] ?? "", HOME: process.env["HOME"] ?? "", ...env },
    });
  const base = {
    DATABASE_URL: "postgresql://nobody@localhost:5432/does_not_exist",
    CURSOR_SECRET: "x".repeat(40),
    ACCESS_TOKEN_SECRET: "y".repeat(40),
  };

  it("refuses to run in production", () => {
    const r = cli({ ...base, NODE_ENV: "production" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("development only");
  });

  it("refuses a database that is not on this computer unless told otherwise", () => {
    const r = cli({
      ...base,
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://u:p@db.example.com:5432/app",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("db.example.com");
    expect(r.stderr).toContain("--allow-remote-db");
  });
});

describe("the demo assets and content", () => {
  it("references only files that exist and are valid", async () => {
    for (const c of DEMO_COURSES) {
      const png = await readFile(join(assetsDir, "thumbnails", c.thumbnail));
      expect(sniffImage(png)).toBe("image/png");
      expect(png.length).toBeLessThan(2 * 1024 * 1024);
      for (const l of c.modules.flatMap((m) => m.lessons)) {
        if (l.video) {
          const v = await readFile(join(assetsDir, "videos", l.video));
          expect(v.subarray(4, 8).toString("latin1")).toBe("ftyp");
          expect(v.length).toBeLessThan(5 * 1024 * 1024);
        }
        if (l.pdf)
          expect(sniffType(await readFile(join(assetsDir, "pdfs", l.pdf.file)))).toBe(
            "application/pdf",
          );
      }
    }
    for (const a of Object.values(DEMO_ASSIGNMENTS)) {
      expect(sniffType(await readFile(join(assetsDir, "pdfs", a.attachment)))).toBe(
        "application/pdf",
      );
    }
  });

  it("is substantial, structured as asked, and makes no promises about returns", () => {
    expect(DEMO_COURSES.map((c) => c.title)).toEqual([
      "Trading Fundamentals",
      "Candlestick Chart Mastery",
      "Technical Analysis Essentials",
      "Risk Management & Trading Psychology",
      "Options Trading Fundamentals",
    ]);
    expect(DEMO_COURSES.map((c) => c.level)).toEqual([
      "beginner",
      "beginner",
      "intermediate",
      "intermediate",
      "advanced",
    ]);
    const banned =
      /guarantee|risk[- ]free|get rich|can't lose|cannot lose|sure thing|double your money|passive income/i;
    // "Not a guarantee" is the opposite of a promise, so negated uses are allowed.
    const promises = (text: string) => text.replace(/\b(not|no|never) (a )?guarantee[sd]?\b/gi, "");
    for (const c of DEMO_COURSES) {
      expect(c.modules.flatMap((m) => m.lessons)).toHaveLength(6);
      expect(c.modules.flatMap((m) => m.lessons).filter((l) => l.preview)).toHaveLength(1);
      expect(promises(c.description)).not.toMatch(banned);
      for (const l of c.modules.flatMap((m) => m.lessons)) {
        expect(l.body.length, l.title).toBeGreaterThan(900);
        expect(promises(l.body), l.title).not.toMatch(banned);
        expect(l.body, l.title).toContain("Educational content only");
      }
    }
  });
});
