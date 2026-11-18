/** File types staff may attach to lessons (decision Q04 pending: what students may download). */
export const ALLOWED_TYPES = {
  "application/pdf": { label: "PDF", ext: ["pdf"] },
  "image/png": { label: "PNG image", ext: ["png"] },
  "image/jpeg": { label: "JPEG image", ext: ["jpg", "jpeg"] },
  "image/webp": { label: "WebP image", ext: ["webp"] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    label: "Word document",
    ext: ["docx"],
  },
  "text/plain": { label: "Text file", ext: ["txt"] },
} as const;
export type AllowedType = keyof typeof ALLOWED_TYPES;

const starts = (b: Buffer, sig: number[], offset = 0) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

/**
 * What the bytes actually are, from their first bytes and (for Word) the zip's entries. The
 * declared type is never trusted. Returns null for anything not on the list.
 */
export function sniffType(b: Buffer): AllowedType | null {
  if (starts(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  if (starts(b, [0x50, 0x4b, 0x03, 0x04])) {
    // A .docx is a zip whose entries include word/document.xml.
    return b.includes(Buffer.from("word/document.xml")) ? AllowedTypeDocx : null;
  }
  if (isPlainText(b)) return "text/plain";
  return null;
}
const AllowedTypeDocx: AllowedType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** UTF-8 text without NUL or other control characters except tab, newline and carriage return. */
export function isPlainText(b: Buffer): boolean {
  if (b.length === 0) return false;
  const text = b.toString("utf8");
  if (Buffer.from(text, "utf8").length !== b.length || text.includes("�")) return false;
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);
}

/** A display file name: no path, no control characters, at most 120 characters. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001F\u007F"]/g, "").trim();
  return (clean || "file").slice(0, 120);
}
