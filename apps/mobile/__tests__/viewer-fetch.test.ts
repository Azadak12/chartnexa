import { apiFetch } from "../src/api/client";
import { authedFetch } from "../src/auth/authed-fetch";
import { viewerFetch } from "../src/api/viewer-fetch";
import { sessionStore } from "../src/session/session-store";

jest.mock("../src/api/client", () => ({ apiFetch: jest.fn(async () => "public") }));
jest.mock("../src/auth/authed-fetch", () => ({ authedFetch: jest.fn(async () => "signed-in") }));

afterEach(() => {
  jest.clearAllMocks();
  sessionStore.set("signed-out");
});

describe("viewerFetch", () => {
  it("sends the token only when someone is signed in", async () => {
    sessionStore.set("signed-out");
    expect(await viewerFetch("/courses/c1")).toBe("public");
    expect(apiFetch).toHaveBeenCalledWith("/courses/c1");
    expect(authedFetch).not.toHaveBeenCalled();

    sessionStore.set("signed-in");
    expect(await viewerFetch("/courses/c1")).toBe("signed-in");
    expect(authedFetch).toHaveBeenCalledWith("/courses/c1");
  });

  it("does not use the token while the session is still being restored", async () => {
    sessionStore.set("restoring");
    await viewerFetch("/courses/c1");
    expect(authedFetch).not.toHaveBeenCalled();
  });
});
