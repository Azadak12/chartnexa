import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import * as SecureStore from "expo-secure-store";
import { fetchAccess } from "../src/courses/course-api";
import { invitationApi } from "../src/invitations/invitation-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";
import { mockBackHandler } from "../test-utils/back-handler";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
  fetchAccess: jest.fn(),
}));
jest.mock("../src/auth/account-api", () => ({
  accountApi: {
    me: jest.fn().mockResolvedValue({
      id: "u1",
      email: "a@b.co",
      displayName: "Ann",
      emailVerified: true,
      createdAt: "2026-11-17T00:00:00.000Z",
    }),
    resendVerification: jest.fn(),
  },
}));

const access = fetchAccess as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
mockBackHandler();
const app = "./app";
const hidden = { includeHiddenElements: true };
const ADMIN = {
  roles: ["student", "admin"],
  permissions: ["instructors:invite", "roles:manage", "users:read"],
  courseGrants: [],
};
const MANAGER = {
  roles: ["student", "manager"],
  permissions: ["instructors:invite", "users:read"],
  courseGrants: [],
};
const STUDENT = { roles: ["student"], permissions: [], courseGrants: [] };
const page = <T,>(items: T[], nextCursor: string | null = null) => ({ items, nextCursor });
const inv = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  email: "ivy@example.com",
  status: "pending",
  invitedByName: "Mia Manager",
  createdAt: "2026-11-19T10:00:00.000Z",
  expiresAt: "2026-11-26T10:00:00.000Z",
  acceptedAt: null,
  revokedAt: null,
  ...over,
});
const teacher = {
  id: "t1",
  displayName: "Dana Instructor",
  email: "dana@example.com",
  since: "2026-11-01T00:00:00.000Z",
  courseCount: 2,
};

let announce: jest.SpyInstance;
let s: Record<
  "list" | "invite" | "resend" | "revoke" | "instructors" | "deactivate" | "accept",
  jest.SpyInstance
>;
beforeEach(async () => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  access.mockResolvedValue(ADMIN);
  s = {
    list: jest.spyOn(invitationApi, "list").mockResolvedValue(page([])),
    invite: jest.spyOn(invitationApi, "invite"),
    resend: jest.spyOn(invitationApi, "resend"),
    revoke: jest.spyOn(invitationApi, "revoke"),
    instructors: jest.spyOn(invitationApi, "instructors").mockResolvedValue([]),
    deactivate: jest.spyOn(invitationApi, "deactivate"),
    accept: jest.spyOn(invitationApi, "accept"),
  };
});

describe("staff screen", () => {
  it("is offered on Profile only to people who may invite, and refuses others", async () => {
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByRole("button", { name: "Invite instructors" })).toBeTruthy();
    await screen.unmount();
    access.mockResolvedValue(STUDENT);
    await renderRouter(app, { initialUrl: "/profile" });
    await screen.findByRole("button", { name: "Edit name" });
    expect(screen.queryByRole("button", { name: "Invite instructors" })).toBeNull();
    await screen.unmount();
    await renderRouter(app, { initialUrl: "/profile/invitations" });
    expect(
      await screen.findByText("Only Admins and Managers can invite Instructors."),
    ).toBeTruthy();
    expect(s.list).not.toHaveBeenCalled();
  });

  it("invites by email after checking the address, and shows server problems", async () => {
    s.invite
      .mockRejectedValueOnce(appError("conflict", { requestId: "r1" }))
      .mockResolvedValueOnce(inv());
    await renderRouter(app, { initialUrl: "/profile/invitations" });
    await fireEvent.press(await screen.findByRole("button", { name: "Invite an instructor" }));
    await fireEvent.press(screen.getByRole("button", { name: "Send invitation", ...hidden }));
    expect(await screen.findByText("Enter a valid email address", hidden)).toBeTruthy();
    expect(s.invite).not.toHaveBeenCalled();
    await fireEvent.changeText(
      screen.getByLabelText("Email address", hidden),
      "  ivy@example.com ",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send invitation", ...hidden }));
    expect(await screen.findByTestId("invite-error", hidden)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Send invitation", ...hidden }));
    await waitFor(() => expect(s.invite).toHaveBeenCalledTimes(2));
    expect(s.invite).toHaveBeenLastCalledWith("ivy@example.com");
    expect(await screen.findByText(/Invitation sent to ivy@example\.com\./)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Invitation sent to ivy@example.com.");
  });

  it("shows each invitation's status in words and offers actions only where they apply", async () => {
    s.list.mockResolvedValue(
      page([
        inv(),
        inv({
          id: "i2",
          email: "acc@example.com",
          status: "accepted",
          acceptedAt: "2026-11-20T10:00:00.000Z",
        }),
        inv({
          id: "i3",
          email: "rev@example.com",
          status: "revoked",
          revokedAt: "2026-11-20T10:00:00.000Z",
        }),
        inv({ id: "i4", email: "old@example.com", status: "expired" }),
      ]),
    );
    await renderRouter(app, { initialUrl: "/profile/invitations" });
    expect(await screen.findByText("ivy@example.com")).toBeTruthy();
    expect(screen.getByText(/^Accepted · accepted/)).toBeTruthy();
    expect(screen.getByText(/^Revoked · revoked/)).toBeTruthy();
    expect(screen.getByText(/^Expired · expired/)).toBeTruthy();
    expect(screen.getByText(/^Open · expires/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Resend invitation to/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Revoke invitation to/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Invite .* again$/ })).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "Revoked" }));
    await waitFor(() => expect(s.list).toHaveBeenLastCalledWith("revoked", undefined));
  });

  it("resends, revokes and reinvites, reporting what happened or what went wrong", async () => {
    s.list.mockResolvedValue(
      page([inv(), inv({ id: "i4", email: "old@example.com", status: "expired" })]),
    );
    s.resend.mockResolvedValue(inv());
    s.revoke
      .mockRejectedValueOnce(appError("conflict"))
      .mockResolvedValueOnce(inv({ status: "revoked" }));
    s.invite.mockResolvedValue(inv());
    await renderRouter(app, { initialUrl: "/profile/invitations" });
    await fireEvent.press(
      await screen.findByRole("button", { name: "Resend invitation to ivy@example.com" }),
    );
    expect(await screen.findByText(/Sent again to ivy@example\.com\./)).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Revoke invitation to ivy@example.com" }),
    );
    expect(await screen.findByTestId("inv-error")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Revoke invitation to ivy@example.com" }),
    );
    expect(await screen.findByText(/Invitation revoked\./)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Invite old@example.com again" }));
    await waitFor(() => expect(s.invite).toHaveBeenCalledWith("old@example.com"));
  });

  it("has empty, error and paging states", async () => {
    await renderRouter(app, { initialUrl: "/profile/invitations" });
    expect(await screen.findByText("No invitations yet")).toBeTruthy();
    await screen.unmount();
    s.list.mockRejectedValueOnce(appError("unknown"));
    s.list
      .mockResolvedValueOnce(page([inv()], "next"))
      .mockResolvedValueOnce(page([inv({ id: "i9", email: "next@example.com" })]));
    await renderRouter(app, { initialUrl: "/profile/invitations" });
    await fireEvent.press(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("ivy@example.com")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("next@example.com")).toBeTruthy();
  });

  it("lets Admins, but not Managers, deactivate an instructor after asking for a reason", async () => {
    s.instructors.mockResolvedValue([teacher]);
    s.deactivate.mockResolvedValue({
      userId: "t1",
      grantsEnded: 2,
      sessionsEnded: 1,
      coursesKept: 2,
    });
    await renderRouter(app, { initialUrl: "/profile/invitations" });
    expect(await screen.findByText(/dana@example\.com · since .* · 2 courses/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Deactivate Dana Instructor" }));
    expect(screen.getByText(/lose the Instructor role/, hidden)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Deactivate", ...hidden }));
    expect(await screen.findByText(/Write \d+ to \d+ characters/, hidden)).toBeTruthy();
    expect(s.deactivate).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Reason", hidden), "Left the team");
    await fireEvent.press(screen.getByRole("button", { name: "Deactivate", ...hidden }));
    await waitFor(() => expect(s.deactivate).toHaveBeenCalledWith("t1", "Left the team"));
    expect(await screen.findByText(/2 courses stay published\./)).toBeTruthy();
    await screen.unmount();
    access.mockResolvedValue(MANAGER);
    await renderRouter(app, { initialUrl: "/profile/invitations" });
    await screen.findByText("Dana Instructor");
    expect(screen.queryByRole("button", { name: /^Deactivate/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Permissions of Dana Instructor" })).toBeTruthy();
  });
});

describe("accepting an invitation", () => {
  beforeEach(() => sessionStore.set("signed-out"));

  it("can be reached from the Welcome screen without a link", async () => {
    await renderRouter(app, { initialUrl: "/welcome" });
    await fireEvent.press(await screen.findByRole("button", { name: "I have an invitation" }));
    expect(screen).toHavePathname("/accept-invitation");
    expect(await screen.findByLabelText("Invitation code")).toBeTruthy();
  });

  it("takes the code from the link, checks the form, and sends the person to sign in", async () => {
    s.accept.mockResolvedValue(undefined);
    await renderRouter(app, { initialUrl: "/accept-invitation?token=abcdefghijklmnopqrstuvwxyz" });
    expect(await screen.findByDisplayValue("abcdefghijklmnopqrstuvwxyz")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByText("Enter your name")).toBeTruthy();
    expect(s.accept).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Your name"), "Ivy Instructor");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long unusual passphrase 42");
    await fireEvent.changeText(
      screen.getByLabelText("Confirm password"),
      "something else entirely",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByText("The passwords do not match")).toBeTruthy();
    expect(s.accept).not.toHaveBeenCalled();
    await fireEvent.changeText(
      screen.getByLabelText("Confirm password"),
      "a long unusual passphrase 42",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(s.accept).toHaveBeenCalledTimes(1));
    expect(s.accept).toHaveBeenCalledWith({
      token: "abcdefghijklmnopqrstuvwxyz",
      displayName: "Ivy Instructor",
      password: "a long unusual passphrase 42",
    });
    await waitFor(() => expect(screen).toHavePathname("/sign-in"));
    expect(await screen.findByText(/Invitation accepted/)).toBeTruthy();
  });

  it("shows why it failed, keeps what was typed, and does not submit twice", async () => {
    let release!: (e: unknown) => void;
    s.accept.mockImplementationOnce(() => new Promise((_r, rej) => (release = rej)));
    await renderRouter(app, { initialUrl: "/accept-invitation" });
    await fireEvent.changeText(
      await screen.findByLabelText("Invitation code"),
      "abcdefghijklmnopqrstuvwxyz",
    );
    await fireEvent.changeText(screen.getByLabelText("Your name"), "Ivy Instructor");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long unusual passphrase 42");
    await fireEvent.changeText(
      screen.getByLabelText("Confirm password"),
      "a long unusual passphrase 42",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Accept invitation" }));
    await fireEvent.press(screen.getByRole("button", { name: "Accept invitation" }));
    expect(s.accept).toHaveBeenCalledTimes(1);
    await act(async () =>
      release(
        appError("validation", {
          fields: [{ field: "password", message: "Use a longer password" }],
        }),
      ),
    );
    expect(await screen.findByText("Use a longer password")).toBeTruthy();
    expect(screen.getByDisplayValue("Ivy Instructor")).toBeTruthy();
    s.accept.mockRejectedValueOnce(appError("conflict"));
    await fireEvent.press(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByTestId("accept-error")).toBeTruthy();
  });
});
