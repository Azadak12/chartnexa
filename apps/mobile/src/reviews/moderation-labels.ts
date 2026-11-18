import { OTHER_NOTE_MIN, type ReviewReason } from "@chartnexa/api-contracts";

/** Plain-language reasons. None of them is about how many stars a review gave. */
export const REASON_LABEL: Record<ReviewReason, string> = {
  spam: "Spam or advertising",
  abusive: "Abusive or harassing",
  personal_info: "Shares personal information",
  off_topic: "Not about this course",
  other: "Something else",
};
export const REASON_ORDER: ReviewReason[] = [
  "spam",
  "abusive",
  "personal_info",
  "off_topic",
  "other",
];
export const OTHER_NOTE_HINT = `Explain in at least ${OTHER_NOTE_MIN} characters`;
