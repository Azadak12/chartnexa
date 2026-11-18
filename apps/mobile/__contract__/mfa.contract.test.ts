import * as SecureStore from "expo-secure-store";
import { authHttp } from "../src/auth/auth-http";
import { authedFetch } from "../src/auth/authed-fetch";
import { mfaApi } from "../src/auth/mfa-api";
import { sessionManager } from "../src/auth/session-manager";
import { AppError } from "../src/api/errors";
import { instructorApi } from "../src/instructors/instructor-api";
import { sessionStore } from "../src/session/session-store";
import {
  currentStep,
  GOOD_PASSWORD,
  loginAny,
  loginPair,
  makeAdmin,
  realFetch,
  totpCode,
  uniqueEmail,
  waitForToken,
} from "./helpers";

const secure = SecureStore as unknown as { __reset: () => void };

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_BASE_URL = process.env.CONTRACT_API_URL;
  (globalThis as { fetch: unknown }).fetch = realFetch;
});
afterEach(() => sessionManager._resetForTests());

async function newAccount(): Promise<string> {
  const email = uniqueEmail();
  await authHttp.register({ email, password: GOOD_PASSWORD });
  await authHttp.verifyEmail(await waitForToken(email, "Verify your ChartNexa email"));
  return email;
}
async function signInAsAdmin(email: string): Promise<void> {
  secure.__reset();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(await loginAny(email, GOOD_PASSWORD));
}
const failure = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error("expected a failure");
};
const challengeFor = async (email: string) => {
  const r = await authHttp.login({ email, password: GOOD_PASSWORD });
  if ("accessToken" in r) throw new Error("expected a second step");
  return r;
};

describe("Two-step sign-in against the real API", () => {
  it("enrolls, signs in with codes and recovery codes, refuses replays, and is reset by an Admin", async () => {
    const adminEmail = await newAccount();
    const managerEmail = await newAccount();
    makeAdmin(adminEmail);

    // The Admin's first sign-in is the setup; the app's own calls then work.
    await signInAsAdmin(adminEmail);
    expect(await mfaApi.status()).toMatchObject({ required: true, enabled: true });
    const manager = await instructorApi.lookup(managerEmail);
    await authedFetch(`/staff/users/${manager.id}/role`, {
      method: "PUT",
      body: { role: "manager", reason: "Runs operations" },
    });

    // The Manager enrolls through the real setup and receives 10 recovery codes.
    const first = await challengeFor(managerEmail);
    expect(first.status).toBe("mfa_setup_required");
    const key = await authHttp.startMfaSetup(first.challengeToken);
    expect(key.otpauthUri).toContain("otpauth://totp/");
    const step = currentStep();
    const done = await authHttp.completeMfaSetup({
      challengeToken: first.challengeToken,
      code: totpCode(key.secret, step),
    });
    expect(done.recoveryCodes).toHaveLength(10);

    // Signing in again needs a code; the code just used cannot be reused.
    const replay = await challengeFor(managerEmail);
    expect(replay.status).toBe("mfa_required");
    expect(
      (
        await failure(
          authHttp.verifyMfa({
            challengeToken: replay.challengeToken,
            code: totpCode(key.secret, step),
          }),
        )
      ).kind,
    ).toBe("unauthorized");
    // A wrong code and a made-up recovery code are refused the same way.
    const again = await challengeFor(managerEmail);
    expect(
      (await failure(authHttp.verifyMfa({ challengeToken: again.challengeToken, code: "000000" })))
        .kind,
    ).toBe("unauthorized");
    expect(
      (
        await failure(
          authHttp.verifyMfa({ challengeToken: again.challengeToken, code: "abcd-efgh-jkmn" }),
        )
      ).kind,
    ).toBe("unauthorized");

    // The next step's code works, and so does a recovery code, once.
    const next = await challengeFor(managerEmail);
    const viaCode = await authHttp.verifyMfa({
      challengeToken: next.challengeToken,
      code: totpCode(key.secret, step + 1),
    });
    expect(viaCode.recoveryCodesRemaining).toBeNull();
    const withCode = await challengeFor(managerEmail);
    const viaRecovery = await authHttp.verifyMfa({
      challengeToken: withCode.challengeToken,
      code: done.recoveryCodes[0]!,
    });
    expect(viaRecovery.recoveryCodesRemaining).toBe(9);
    const reuse = await challengeFor(managerEmail);
    expect(
      (
        await failure(
          authHttp.verifyMfa({
            challengeToken: reuse.challengeToken,
            code: done.recoveryCodes[0]!,
          }),
        )
      ).kind,
    ).toBe("unauthorized");

    // The Admin resets the Manager: the session ends and setup is needed again.
    await signInAsAdmin(adminEmail);
    await authedFetch(`/staff/users/${manager.id}/mfa/reset`, {
      method: "POST",
      body: { reason: "Lost the phone" },
    });
    expect((await challengeFor(managerEmail)).status).toBe("mfa_setup_required");
  });

  it("leaves Students and Instructors alone, and a promotion forces enrollment", async () => {
    const adminEmail = await newAccount();
    const studentEmail = await newAccount();
    const instructorEmail = await newAccount();
    const promotedEmail = await newAccount();
    makeAdmin(adminEmail);
    await signInAsAdmin(adminEmail);
    const instructor = await instructorApi.lookup(instructorEmail);
    await instructorApi.makeInstructor(instructor.id, "Teaches trading");

    // Students and Instructors get tokens straight away.
    expect(
      (await loginPair({ email: studentEmail, password: GOOD_PASSWORD })).accessToken,
    ).toBeTruthy();
    expect(
      (await loginPair({ email: instructorEmail, password: GOOD_PASSWORD })).accessToken,
    ).toBeTruthy();
    expect(
      await (async () => {
        secure.__reset();
        sessionManager._resetForTests();
        sessionStore.set("signed-out");
        await sessionManager.signIn(
          await loginPair({ email: studentEmail, password: GOOD_PASSWORD }),
        );
        return mfaApi.status();
      })(),
    ).toEqual({ required: false, enabled: false, recoveryCodesRemaining: 0 });

    // A person with an open session is promoted: that session ends and the next sign-in is setup.
    const open = await loginPair({ email: promotedEmail, password: GOOD_PASSWORD });
    await signInAsAdmin(adminEmail);
    const promoted = await instructorApi.lookup(promotedEmail);
    await authedFetch(`/staff/users/${promoted.id}/role`, {
      method: "PUT",
      body: { role: "manager", reason: "Joins operations" },
    });
    const refreshed = await failure(authHttp.refresh(open.refreshToken));
    expect(refreshed.kind).toBe("unauthorized");
    expect((await challengeFor(promotedEmail)).status).toBe("mfa_setup_required");
  });

  it("gives new recovery codes only with the password and a current code, and ends the old set", async () => {
    const adminEmail = await newAccount();
    const managerEmail = await newAccount();
    makeAdmin(adminEmail);
    await signInAsAdmin(adminEmail);
    const manager = await instructorApi.lookup(managerEmail);
    await authedFetch(`/staff/users/${manager.id}/role`, {
      method: "PUT",
      body: { role: "manager", reason: "Runs operations" },
    });
    const ch = await challengeFor(managerEmail);
    const key = await authHttp.startMfaSetup(ch.challengeToken);
    const step = currentStep();
    const done = await authHttp.completeMfaSetup({
      challengeToken: ch.challengeToken,
      code: totpCode(key.secret, step),
    });

    secure.__reset();
    sessionManager._resetForTests();
    sessionStore.set("signed-out");
    await sessionManager.signIn({
      accessToken: done.accessToken,
      refreshToken: done.refreshToken,
      sessionId: done.sessionId,
      expiresIn: done.expiresIn,
    });
    expect(await mfaApi.status()).toEqual({
      required: true,
      enabled: true,
      recoveryCodesRemaining: 10,
    });
    // A wrong password and a reused code are refused with a 400 (the session stays); the next step's code with the password works.
    expect(
      (
        await failure(
          mfaApi.regenerate({
            password: "wrong password value",
            code: totpCode(key.secret, step + 1),
          }),
        )
      ).kind,
    ).toBe("validation");
    expect(
      (
        await failure(
          mfaApi.regenerate({ password: GOOD_PASSWORD, code: totpCode(key.secret, step) }),
        )
      ).kind,
    ).toBe("validation");
    const fresh = await mfaApi.regenerate({
      password: GOOD_PASSWORD,
      code: totpCode(key.secret, step + 1),
    });
    expect(fresh).toHaveLength(10);
    expect(fresh.some((c) => done.recoveryCodes.includes(c))).toBe(false);

    const old = await challengeFor(managerEmail);
    expect(
      (
        await failure(
          authHttp.verifyMfa({ challengeToken: old.challengeToken, code: done.recoveryCodes[0]! }),
        )
      ).kind,
    ).toBe("unauthorized");
    const ok = await challengeFor(managerEmail);
    expect(
      (await authHttp.verifyMfa({ challengeToken: ok.challengeToken, code: fresh[0]! }))
        .recoveryCodesRemaining,
    ).toBe(9);
  });
});
