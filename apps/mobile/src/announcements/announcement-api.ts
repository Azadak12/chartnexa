import {
  announcementPageSchema,
  staffAnnouncementPageSchema,
  staffAnnouncementSchema,
  unreadCountSchema,
  type Announcement,
  type StaffAnnouncement,
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
const cursorQuery = (cursor?: string) => (cursor ? `?cursor=${enc(cursor)}` : "");

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const announcementApi = {
  async list(cursor?: string): Promise<Page<Announcement>> {
    return check(
      announcementPageSchema,
      await authedFetch(`/me/announcements${cursorQuery(cursor)}`),
    );
  },
  async unread(): Promise<number> {
    return check(unreadCountSchema, await authedFetch("/me/announcements/unread-count")).unread;
  },
  async markRead(id: string): Promise<void> {
    await authedFetch(`/me/announcements/${enc(id)}/read`, { method: "PUT" });
  },
};

export const staffAnnouncementApi = {
  async list(cursor?: string): Promise<Page<StaffAnnouncement>> {
    return check(
      staffAnnouncementPageSchema,
      await authedFetch(`/staff/announcements${cursorQuery(cursor)}`),
    );
  },
  async publish(body: {
    title: string;
    body: string;
    courseId?: string;
    idempotencyKey: string;
  }): Promise<StaffAnnouncement> {
    return check(
      staffAnnouncementSchema,
      await authedFetch("/staff/announcements", { method: "POST", body }),
    );
  },
  async withdraw(id: string, reason: string): Promise<StaffAnnouncement> {
    return check(
      staffAnnouncementSchema,
      await authedFetch(`/staff/announcements/${enc(id)}/withdraw`, {
        method: "POST",
        body: { reason },
      }),
    );
  },
};

/** One key per draft, kept across retries so a lost answer never posts twice. */
export const newAnnouncementKey = (): string =>
  `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
