import { describe, expect, it } from "vitest";
import {
  completeMfaSetupRequestSchema,
  loginResponseSchema,
  mfaChallengeSchema,
  mfaSetupCompleteResponseSchema,
  mfaSignInResponseSchema,
  mfaStatusSchema,
  regenerateRecoveryCodesRequestSchema,
  resetMfaRequestSchema,
  verifyMfaRequestSchema,
} from "./mfa.js";

const pair = { accessToken: "a", refreshToken: "r", sessionId: "s", expiresIn: 600 };
const token = "t".repeat(43);

describe("sign-in response", () => {
  it("still accepts a plain token pair and a challenge", () => {
    expect(loginResponseSchema.safeParse(pair).success).toBe(true);
    expect(
      loginResponseSchema.safeParse({
        status: "mfa_required",
        challengeToken: token,
        expiresInSeconds: 300,
      }).success,
    ).toBe(true);
    expect(
      mfaChallengeSchema.safeParse({
        status: "mfa_setup_required",
        challengeToken: token,
        expiresInSeconds: 300,
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown status and an empty answer", () => {
    expect(
      mfaChallengeSchema.safeParse({
        status: "other",
        challengeToken: token,
        expiresInSeconds: 300,
      }).success,
    ).toBe(false);
    expect(loginResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe("codes", () => {
  it("accepts 6 digits and recovery codes with spaces or hyphens, and nothing else", () => {
    for (const code of ["123456", "123 456", "abcd-efgh-jkmn", "ABCDEFGHJKMN"]) {
      expect(verifyMfaRequestSchema.safeParse({ challengeToken: token, code }).success, code).toBe(
        true,
      );
    }
    for (const code of ["", "12345", "a".repeat(25), "12;456", "<script>"]) {
      expect(verifyMfaRequestSchema.safeParse({ challengeToken: token, code }).success, code).toBe(
        false,
      );
    }
  });

  it("setup and regenerate need exactly 6 digits (spaces ignored)", () => {
    expect(
      completeMfaSetupRequestSchema.parse({ challengeToken: token, code: "123 456" }).code,
    ).toBe("123456");
    for (const code of ["12345", "1234567", "abcdef", ""]) {
      expect(
        completeMfaSetupRequestSchema.safeParse({ challengeToken: token, code }).success,
        code,
      ).toBe(false);
    }
    expect(
      regenerateRecoveryCodesRequestSchema.safeParse({ password: "p", code: "123456" }).success,
    ).toBe(true);
    expect(
      regenerateRecoveryCodesRequestSchema.safeParse({ password: "", code: "123456" }).success,
    ).toBe(false);
  });

  it("rejects short challenge tokens and unknown fields", () => {
    expect(
      verifyMfaRequestSchema.safeParse({ challengeToken: "short", code: "123456" }).success,
    ).toBe(false);
    expect(
      verifyMfaRequestSchema.safeParse({ challengeToken: token, code: "123456", extra: 1 }).success,
    ).toBe(false);
  });
});

describe("other shapes", () => {
  it("reset needs a reason of 3 to 200 characters", () => {
    expect(resetMfaRequestSchema.safeParse({ reason: "Lost phone" }).success).toBe(true);
    expect(resetMfaRequestSchema.safeParse({ reason: "ab" }).success).toBe(false);
    expect(resetMfaRequestSchema.safeParse({ reason: "x".repeat(201) }).success).toBe(false);
  });

  it("setup completion carries exactly 10 recovery codes", () => {
    const codes = Array.from({ length: 10 }, (_, i) => `aaaa-bbbb-cc${i}${i}`);
    expect(
      mfaSetupCompleteResponseSchema.safeParse({ ...pair, recoveryCodes: codes }).success,
    ).toBe(true);
    expect(
      mfaSetupCompleteResponseSchema.safeParse({ ...pair, recoveryCodes: codes.slice(1) }).success,
    ).toBe(false);
  });

  it("sign-in response defaults recovery codes remaining to null; status counts are not negative", () => {
    expect(mfaSignInResponseSchema.parse(pair).recoveryCodesRemaining).toBeNull();
    expect(mfaSignInResponseSchema.safeParse({ ...pair, recoveryCodesRemaining: -1 }).success).toBe(
      false,
    );
    expect(
      mfaStatusSchema.safeParse({ required: true, enabled: true, recoveryCodesRemaining: 7 })
        .success,
    ).toBe(true);
  });
});
