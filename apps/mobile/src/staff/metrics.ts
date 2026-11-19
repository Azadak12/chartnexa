import { useQuery } from "@tanstack/react-query";
import type { AccessResponse } from "@chartnexa/api-contracts";
import { canInviteInstructors, canManageCourses, staffCourseApi } from "../courses/course-api";
import { invitationApi } from "../invitations/invitation-api";
import { shouldRetry } from "../state/query-client";

/** A count from one page of real results: "25+" when there are more pages than were loaded. */
export const countText = (n: number, more: boolean) => (more ? `${n}+` : String(n));

export interface Metric {
  /** "pending", "error" or "success", straight from the request. */
  status: "pending" | "error" | "success";
  value: string;
  retry: () => void;
}

/**
 * The academy numbers, all from the real lists: courses by status, instructors and pending
 * invitations. A request only runs when the role may see it, and each fails on its own.
 */
export function useAcademyMetrics(a: AccessResponse) {
  const courses = canManageCourses(a);
  const people = canInviteInstructors(a);
  const published = useQuery({
    queryKey: ["metric-courses", "published"],
    enabled: courses,
    queryFn: () => staffCourseApi.list({ status: "published" }),
    retry: shouldRetry,
  });
  const drafts = useQuery({
    queryKey: ["metric-courses", "draft"],
    enabled: courses,
    queryFn: () => staffCourseApi.list({ status: "draft" }),
    retry: shouldRetry,
  });
  const instructors = useQuery({
    queryKey: ["metric-instructors"],
    enabled: people,
    queryFn: () => invitationApi.instructors(),
    retry: shouldRetry,
  });
  const pending = useQuery({
    queryKey: ["metric-invitations", "pending"],
    enabled: people,
    queryFn: () => invitationApi.list("pending"),
    retry: shouldRetry,
  });
  const metric = (
    q: { status: Metric["status"]; refetch: () => unknown },
    value: string,
  ): Metric => ({
    status: q.status,
    value,
    retry: () => void q.refetch(),
  });
  // The same two lists also give the instructor's own courses, so showing them costs no request.
  const courseItems = [...(published.data?.items ?? []), ...(drafts.data?.items ?? [])].sort(
    (a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );
  return {
    courses,
    people,
    courseItems,
    pending: metric(
      pending,
      pending.data ? countText(pending.data.items.length, !!pending.data.nextCursor) : "",
    ),
    instructors: metric(instructors, instructors.data ? String(instructors.data.length) : ""),
    published: metric(
      published,
      published.data ? countText(published.data.items.length, !!published.data.nextCursor) : "",
    ),
    drafts: metric(
      drafts,
      drafts.data ? countText(drafts.data.items.length, !!drafts.data.nextCursor) : "",
    ),
    async refetchAll(): Promise<void> {
      await Promise.all(
        [published, drafts, instructors, pending]
          .filter((q) => q.fetchStatus !== "idle" || q.status !== "pending")
          .map((q) => q.refetch()),
      );
    },
  };
}
