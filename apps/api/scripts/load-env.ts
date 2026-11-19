import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.factory.js";
import { loadConfig } from "../src/config/config.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { PasswordService } from "../src/modules/identity/index.js";
import { createScratchDb, migrateDeploy } from "./lib/scratch-db.js";

/**
 * A throwaway API for load tests: scratch database, seeded data, address limits raised so one
 * machine can act as many people. Never point this at real data; it creates and drops its own
 * database. Usage: pnpm --filter @chartnexa/api load:env -- --students 200 --courses 20 --lessons 15
 */
const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : fallback;
  if (!Number.isInteger(v) || v < 0 || v > 100_000)
    throw new Error(`--${name} must be 0 to 100000`);
  return v;
};
const STUDENTS = arg("students", 200);
const COURSES = arg("courses", 20);
const LESSONS = arg("lessons", 15);
const PORT = arg("port", 0);
export const LOAD_PASSWORD = "load test password only";

const db = await createScratchDb();
migrateDeploy(db.url);
const config = loadConfig({
  NODE_ENV: "test",
  LOG_LEVEL: process.env["LOG_LEVEL"] ?? "warn",
  DATABASE_URL: db.url,
  CURSOR_SECRET: "load-cursor-secret-load-cursor-secret",
  ACCESS_TOKEN_SECRET: "load-access-secret-load-access-secret",
  MAILER_DRIVER: "memory",
  RL_REGISTER_IP_MAX: "1000000",
  RL_LOGIN_IP_MAX: "1000000",
  RL_LOGIN_EMAIL_MAX: "1000000",
  RL_GENERIC_IP_MAX: "1000000",
});
const app = await createApp(config);
const prisma = app.get(PrismaService);
const passwords = app.get(PasswordService);

// One hash for every seeded account: hashing is deliberately slow, and the test measures sign-in
// separately from browsing.
const hash = await passwords.hash(LOAD_PASSWORD);
const courseIds: string[] = [];
for (let c = 0; c < COURSES; c++) {
  const course = await prisma.course.create({
    data: {
      title: `Load course ${c + 1}`,
      description: "Seeded for load testing.",
      level: "beginner",
      priceCents: 0,
      status: "published",
      publishedAt: new Date(),
    } as never,
  });
  courseIds.push(course.id);
  await prisma.lesson.createMany({
    data: Array.from({ length: LESSONS }, (_, i) => ({
      courseId: course.id,
      title: `Lesson ${i + 1}`,
      body: "Seeded lesson text. ".repeat(40),
      position: i + 1,
      isPreview: i === 0,
    })) as never,
  });
}
const emails: string[] = [];
for (let s = 0; s < STUDENTS; s++) {
  const email = `load-${s}-${randomUUID().slice(0, 8)}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      emailNormalized: email,
      passwordHash: hash,
      emailVerifiedAt: new Date(),
    },
  });
  emails.push(email);
  // Each student owns three courses, spread over the catalog.
  for (let k = 0; k < Math.min(3, COURSES); k++) {
    await prisma.entitlement.create({
      data: {
        userId: user.id,
        courseId: courseIds[(s + k) % COURSES] as string,
        source: "admin_grant",
        grantReason: "Load test seed",
      },
    });
  }
}

await app.listen({ port: PORT, host: "127.0.0.1" });
const address = app.getHttpServer().address() as { port: number };
// The runner reads this line: port, password, and the seeded accounts.
console.log(
  `READY ${JSON.stringify({ baseUrl: `http://127.0.0.1:${address.port}`, password: LOAD_PASSWORD, emails, courseIds })}`,
);

const stop = async (): Promise<void> => {
  await app.close();
  await db.drop();
  process.exit(0);
};
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
