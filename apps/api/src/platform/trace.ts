import { randomBytes } from "node:crypto";

const TRACEPARENT = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

/** The trace id of a valid W3C `traceparent`, or a new random one. All-zero ids are invalid. */
export function resolveTraceId(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  const m = typeof value === "string" ? TRACEPARENT.exec(value.trim().toLowerCase()) : null;
  if (m && !/^0+$/.test(m[1]!) && !/^0+$/.test(m[2]!)) return m[1]!;
  return randomBytes(16).toString("hex");
}
