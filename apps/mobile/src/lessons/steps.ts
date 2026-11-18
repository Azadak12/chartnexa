/**
 * Splits a lesson's plain text into reading steps: one per paragraph, where a paragraph ends at a
 * blank line (a line with nothing, or only spaces and tabs, on it). A paragraph is never cut, so a
 * long one stays a single step. Empty paragraphs are dropped. The text itself is not changed
 * except for trimming blank space around each step.
 */
export function splitLessonText(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n(?:[ \t]*\n)+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Keeps a remembered step inside what exists now (a lesson may have been edited meanwhile). */
export function clampStep(step: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(step)) return 0;
  return Math.min(Math.max(Math.trunc(step), 0), count - 1);
}
