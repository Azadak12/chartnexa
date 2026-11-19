import { testServer } from "../api/test-server";

/**
 * A navigation helper for testers, not a way in. It lists the five test accounts by their public
 * email and sends the tester to the normal sign-in screen. No password, token, recovery code or
 * authenticator secret is stored here or sent anywhere, and no role is ever granted by the app.
 */
export interface DemoAccount {
  role: "student" | "instructor" | "lecturer" | "manager" | "admin";
  title: string;
  email: string;
  summary: string;
  /** Staff accounts that must finish two-step sign-in after the password. */
  twoStep: boolean;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    role: "student",
    title: "Student",
    email: "student@chartnexa.test",
    summary:
      "Browse and search courses, watch free previews, buy in test mode, learn, review and hand in assignments.",
    twoStep: false,
  },
  {
    role: "instructor",
    title: "Instructor",
    email: "instructor@chartnexa.test",
    summary:
      "Create and edit courses, modules, lessons, videos, PDFs and thumbnails, set assignments and review submissions.",
    twoStep: false,
  },
  {
    role: "lecturer",
    title: "Lecturer",
    email: "lecturer@chartnexa.test",
    summary:
      "A second Instructor account: the same Instructor screens, with access to its own two courses only.",
    twoStep: false,
  },
  {
    role: "manager",
    title: "Manager",
    email: "manager@chartnexa.test",
    summary: "Invite instructors, follow invitation status and run day-to-day moderation.",
    twoStep: true,
  },
  {
    role: "admin",
    title: "Admin",
    email: "admin@chartnexa.test",
    summary:
      "Everything a Manager can do, plus instructor permissions, deactivation, courses and the audit log.",
    twoStep: true,
  },
];

/**
 * On only when both are true: the build is not a production build, and the build or the developer
 * set EXPO_PUBLIC_DEMO_ACCOUNTS=true on purpose. A store build can never show it.
 */
export function demoAccountsEnabled(): boolean {
  return testServer.allowed() && process.env["EXPO_PUBLIC_DEMO_ACCOUNTS"] === "true";
}

/** Only the five public test addresses may be prefilled from a link or a parameter. */
export function demoEmailOrNull(value: unknown): string | null {
  if (!demoAccountsEnabled() || typeof value !== "string") return null;
  return DEMO_ACCOUNTS.find((a) => a.email === value)?.email ?? null;
}
