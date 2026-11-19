import * as SecureStore from "expo-secure-store";
import { AppError } from "../src/api/errors";
import { authHttp } from "../src/auth/auth-http";
import { sessionManager } from "../src/auth/session-manager";
import { fetchAccess } from "../src/courses/course-api";
import { invitationApi } from "../src/invitations/invitation-api";
import { sessionStore } from "../src/session/session-store";
import {
  GOOD_PASSWORD,
  loginAny,
  makeAdmin,
  realFetch,
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
async function signInAs(email: string): Promise<void> {
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
describe("Instructor invitations against the real API", () => {
  it("an Admin invites; the person accepts from the emailed code; the Admin then deactivates them", async () => {
    const adminEmail = await newAccount();
    makeAdmin(adminEmail);
    const inviteeEmail = uniqueEmail();
    await signInAs(adminEmail);
    const sent = await invitationApi.invite(inviteeEmail);
    expect(sent).toMatchObject({ email: inviteeEmail.toLowerCase(), status: "pending" });
    expect((await failure(invitationApi.invite(inviteeEmail))).code).toBe("INVITATION_PENDING");

    const code = await waitForToken(inviteeEmail, "You are invited to teach");
    const bad = await failure(
      invitationApi.accept({ token: code, displayName: "Ivy Instructor", password: "password" }),
    );
    expect(bad.kind).toBe("validation");
    await invitationApi.accept({
      token: code,
      displayName: "Ivy Instructor",
      password: GOOD_PASSWORD,
    });
    expect(
      (
        await failure(
          invitationApi.accept({
            token: code,
            displayName: "Ivy Instructor",
            password: GOOD_PASSWORD,
          }),
        )
      ).code,
    ).toBe("INVITATION_INVALID");

    await signInAs(inviteeEmail);
    expect((await fetchAccess()).roles).toContain("instructor");
    expect((await failure(invitationApi.list(undefined))).kind).toBe("forbidden");

    await signInAs(adminEmail);
    const accepted = await invitationApi.list("accepted");
    expect(accepted.items.find((i) => i.id === sent.id)?.status).toBe("accepted");
    const instructors = await invitationApi.instructors();
    const ivy = instructors.find((i) => i.email === inviteeEmail.toLowerCase());
    expect(ivy).toBeTruthy();
    const result = await invitationApi.deactivate(ivy!.id, "Contract test cleanup");
    expect(result.sessionsEnded).toBeGreaterThanOrEqual(1);
    expect((await invitationApi.instructors()).map((i) => i.id)).not.toContain(ivy!.id);
  }, 120_000);
});
