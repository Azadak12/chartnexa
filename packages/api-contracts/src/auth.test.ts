import { describe, expect, it } from "vitest";
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
} from "./auth.js";

const goodPassword = "correct horse battery";

describe("auth request schemas", () => {
  it("normalizes email case and trims", () => {
    const r = registerRequestSchema.parse({ email: "  Ann@Example.COM ", password: goodPassword });
    expect(r.email).toBe("ann@example.com");
  });

  it("enforces password length for new passwords", () => {
    expect(registerRequestSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(
      false,
    );
    expect(
      registerRequestSchema.safeParse({ email: "a@b.co", password: "x".repeat(129) }).success,
    ).toBe(false);
    expect(
      changePasswordRequestSchema.safeParse({ currentPassword: "x", newPassword: "short" }).success,
    ).toBe(false);
    expect(
      resetPasswordRequestSchema.safeParse({ token: "t".repeat(20), newPassword: goodPassword })
        .success,
    ).toBe(true);
  });

  it("does not apply the length minimum to login passwords but bounds them", () => {
    expect(loginRequestSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(
      loginRequestSchema.safeParse({ email: "a@b.co", password: "x".repeat(129) }).success,
    ).toBe(false);
  });

  it("rejects unknown properties and bad emails", () => {
    expect(
      loginRequestSchema.safeParse({ email: "a@b.co", password: "x", admin: true }).success,
    ).toBe(false);
    expect(loginRequestSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(
      false,
    );
  });
});
