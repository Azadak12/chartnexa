import { randomUUID } from "node:crypto";

const VALID = /^[A-Za-z0-9-]{8,64}$/;

/** Accepts a client request ID only if well-formed; otherwise generates one. Never echoes bad input. */
export function resolveRequestId(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value !== undefined && VALID.test(value) ? value : randomUUID();
}
