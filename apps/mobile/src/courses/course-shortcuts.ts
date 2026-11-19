import type { AccessResponse } from "@chartnexa/api-contracts";
import type { CardAction } from "../kit/CourseManageCard";
import { canAuthorLessons, canScheduleLive } from "./course-api";

/**
 * Direct entries for one course, from this person's own permissions on it: lessons with their
 * videos and files, and live classes. The server checks every call again.
 */
export function courseShortcuts(
  access: AccessResponse | undefined,
  courseId: string,
  go: (path: string) => void,
): CardAction[] {
  const out: CardAction[] = [];
  if (canAuthorLessons(access, courseId)) {
    out.push({
      label: "Lessons & files",
      icon: "video",
      onPress: () => go(`/manage/${courseId}/lessons`),
      testID: `content-${courseId}`,
    });
  }
  if (canScheduleLive(access, courseId)) {
    out.push({
      label: "Live classes",
      icon: "radio",
      onPress: () => go(`/manage/${courseId}/live`),
      testID: `live-${courseId}`,
    });
  }
  return out;
}
