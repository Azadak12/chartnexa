/** Prisma codes for a database that cannot be reached, timed out, or ran out of connections. */
const DB_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);
const NET_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

export type ErrorClass = "dependency" | "server";

interface Codeish {
  name?: unknown;
  code?: unknown;
  cause?: unknown;
}

/** `dependency` when a database or network call failed, otherwise `server` (a bug or an unknown). */
export function classifyError(error: unknown, depth = 0): ErrorClass {
  if (!error || typeof error !== "object" || depth > 3) return "server";
  const e = error as Codeish;
  if (typeof e.name === "string" && e.name === "PrismaClientInitializationError")
    return "dependency";
  if (typeof e.code === "string" && (DB_CODES.has(e.code) || NET_CODES.has(e.code))) {
    return "dependency";
  }
  return e.cause ? classifyError(e.cause, depth + 1) : "server";
}

/**
 * What may be logged about an unexpected error: its type, its code and the stack frames. Never the
 * message, because database and library errors can carry the values of a query (an email, a token).
 */
export function safeError(error: unknown): {
  type: string;
  code?: string;
  errorClass: ErrorClass;
  stack?: string;
} {
  const e = (error && typeof error === "object" ? error : {}) as Codeish & { stack?: unknown };
  const type =
    typeof e.name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(e.name) ? e.name : "Error";
  const code =
    typeof e.code === "string" && /^[A-Za-z0-9_]{1,40}$/.test(e.code) ? e.code : undefined;
  const frames =
    typeof e.stack === "string"
      ? e.stack
          .split("\n")
          .filter((l) => /^\s+at /.test(l))
          .slice(0, 15)
          .join("\n")
      : undefined;
  return {
    type,
    errorClass: classifyError(error),
    ...(code ? { code } : {}),
    ...(frames ? { stack: frames } : {}),
  };
}
