import {
  liveJoinSchema,
  liveSessionListSchema,
  staffLiveSessionListSchema,
  staffLiveSessionSchema,
  type CreateLiveSessionRequest,
  type LiveJoin,
  type LiveSession,
  type LiveState,
  type StaffLiveSession,
  type UpdateLiveSessionRequest,
} from "@chartnexa/api-contracts";
import { z } from "zod";
import { AppError, messageFor } from "../api/errors";
import { authedFetch } from "../auth/authed-fetch";

function check<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("unknown", messageFor("unknown"), null, null);
  return parsed.data;
}
const enc = encodeURIComponent;

export const liveApi = {
  async forCourse(courseId: string): Promise<LiveSession[]> {
    return check(
      liveSessionListSchema,
      await authedFetch(`/courses/${enc(courseId)}/live-sessions`),
    ).items;
  },
  async mine(): Promise<LiveSession[]> {
    return check(liveSessionListSchema, await authedFetch("/me/live-sessions")).items;
  },
  /** The join link; the server gives it only while the class is open. */
  async join(courseId: string, sessionId: string): Promise<LiveJoin> {
    return check(
      liveJoinSchema,
      await authedFetch(`/me/courses/${enc(courseId)}/live-sessions/${enc(sessionId)}/join`, {
        method: "POST",
      }),
    );
  },
};

export const staffLiveApi = {
  async list(courseId: string): Promise<StaffLiveSession[]> {
    return check(
      staffLiveSessionListSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/live-sessions`),
    ).items;
  },
  async create(courseId: string, body: CreateLiveSessionRequest): Promise<StaffLiveSession> {
    return check(
      staffLiveSessionSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/live-sessions`, { method: "POST", body }),
    );
  },
  async update(
    courseId: string,
    sessionId: string,
    body: UpdateLiveSessionRequest,
  ): Promise<StaffLiveSession> {
    return check(
      staffLiveSessionSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/live-sessions/${enc(sessionId)}`, {
        method: "PATCH",
        body,
      }),
    );
  },
  async cancel(
    courseId: string,
    sessionId: string,
    expectedVersion: number,
    reason: string,
  ): Promise<StaffLiveSession> {
    return check(
      staffLiveSessionSchema,
      await authedFetch(`/staff/courses/${enc(courseId)}/live-sessions/${enc(sessionId)}/cancel`, {
        method: "POST",
        body: { expectedVersion, reason },
      }),
    );
  },
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "Tue, Dec 1, 10:00 AM" in the device's language and time zone. */
export function whenText(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h > 0 ? `${h} ${h === 1 ? "hour" : "hours"}` : "";
  const mins = m > 0 ? `${m} ${m === 1 ? "minute" : "minutes"}` : "";
  return [hours, mins].filter(Boolean).join(" ");
}

export const STATE_TEXT: Record<LiveState, string> = {
  upcoming: "Scheduled",
  open: "Open to join",
  live: "Live now",
  ended: "Ended",
  cancelled: "Cancelled",
};

/** The device-local date ("2026-12-01") and time ("09:30") of an instant, for editing. */
export function localParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * Reads a device-local date and 24-hour time into an instant. Answers null for text that is not
 * a real date and time (Feb 30, 25:00), so the form can say which field to fix.
 */
export function fromLocalParts(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!dm || !tm) return null;
  const [y, mo, da] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (h > 23 || mi > 59) return null;
  const d = new Date(y, mo - 1, da, h, mi, 0, 0);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;
  return d;
}
