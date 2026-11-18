import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { fetchAccess, staffCourseApi } from "../src/courses/course-api";
import { staffEntitlementApi } from "../src/entitlements/entitlement-api";
import { instructorApi } from "../src/instructors/instructor-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";
import { mockBackHandler } from "../test-utils/back-handler";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
  staffCourseApi: { list: jest.fn(), get: jest.fn(), update: jest.fn() },
  fetchAccess: jest.fn(),
}));
jest.mock("../src/entitlements/entitlement-api", () => ({
  myCoursesApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })) },
  staffEntitlementApi: { list: jest.fn(), grant: jest.fn(), revoke: jest.fn() },
}));
jest.mock("../src/instructors/instructor-api", () => ({
  ...jest.requireActual("../src/instructors/instructor-api"),
  instructorApi: { lookup: jest.fn() },
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

const api = staffEntitlementApi as unknown as Record<"list" | "grant" | "revoke", jest.Mock>;
const lookup = (instructorApi as unknown as { lookup: jest.Mock }).lookup;
const courseGet = (staffCourseApi as unknown as { get: jest.Mock }).get;
const access = fetchAccess as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
mockBackHandler();
const app = "./app";

const MANAGER = {
  roles: ["student", "manager"],
  permissions: ["course:update", "enrollments:manage", "users:read"],
};
const NO_ENROLL = { roles: ["student", "instructor"], permissions: [], courseGrants: [] };

const student = (n: number, over: Record<string, unknown> = {}) => ({
  id: `e${n}`,
  user: { id: `u${n}`, displayName: `Student ${n}`, email: `s${n}@example.com` },
  source: "admin_grant",
  grantReason: `Reason ${n}`,
  createdAt: "2026-11-18T00:00:00.000Z",
  ...over,
});
const page = (items: unknown[], nextCursor: string | null = null) => ({ items, nextCursor });
const entitlement = {
  id: "e9",
  courseId: "c1",
  userId: "u9",
  source: "admin_grant",
  status: "active",
  grantReason: "Reason",
  createdAt: "2026-11-18T00:00:00.000Z",
  revokedAt: null,
};
const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  access.mockResolvedValue(MANAGER);
  api.list.mockResolvedValue(
    page([
      student(1),
      student(2, { user: { id: "u2", displayName: null, email: "only@example.com" } }),
    ]),
  );
});

describe("access", () => {
  it("shows no-access and fetches nothing for someone without enrollment rights", async () => {
    access.mockResolvedValue(NO_ENROLL);
    await renderRouter(app, { initialUrl: "/manage/c1/students" });
    expect(await screen.findByText("You do not have access")).toBeTruthy();
    expect(api.list).not.toHaveBeenCalled();
    await screen.unmount();
    await renderRouter(app, { initialUrl: "/manage/c1/students/grant" });
    expect(await screen.findByText("You do not have access")).toBeTruthy();
    expect(api.grant).not.toHaveBeenCalled();
  });

  it("offers Students on the course screen to staff who manage enrollments, and not to others", async () => {
    courseGet.mockResolvedValue({
      id: "c1",
      title: "Price Action Basics",
      description: "d",
      level: "beginner",
      priceCents: 0,
      currency: "USD",
      coverTone: "blue",
      status: "draft",
      version: 1,
      publishedAt: null,
      createdAt: "2026-11-17T00:00:00.000Z",
      updatedAt: "2026-11-17T00:00:00.000Z",
    });
    await renderRouter(app, { initialUrl: "/manage/c1" });
    await screen.findByDisplayValue("Price Action Basics");
    await press("Students");
    expect(screen).toHavePathname("/manage/c1/students");
    await screen.unmount();

    access.mockResolvedValue({ ...MANAGER, permissions: ["course:update"] });
    await renderRouter(app, { initialUrl: "/manage/c1" });
    await screen.findByDisplayValue("Price Action Basics");
    expect(screen.queryByRole("button", { name: "Students" })).toBeNull();
  });
});

describe("the list of people with access", () => {
  it("shows names, emails and reasons, falling back to the email when there is no name", async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/students" });
    expect(await screen.findByTestId("student-e1")).toBeTruthy();
    expect(screen.getByText("Student 1")).toBeTruthy();
    expect(screen.getByText("s1@example.com")).toBeTruthy();
    expect(screen.getByText("Reason: Reason 1")).toBeTruthy();
    expect(screen.getByText("only@example.com")).toBeTruthy();
    expect(api.list).toHaveBeenCalledWith("c1", undefined);
  });

  it("shows an empty state, and an error with Retry", async () => {
    api.list.mockResolvedValueOnce(page([]));
    const first = await renderRouter(app, { initialUrl: "/manage/c1/students" });
    expect(await first.findByText("No one has access yet")).toBeTruthy();
    await first.unmount();

    api.list.mockRejectedValueOnce(appError("unknown")).mockResolvedValue(page([student(1)]));
    const second = await renderRouter(app, { initialUrl: "/manage/c1/students" });
    expect(await second.findByTestId("state-error")).toBeTruthy();
    await fireEvent.press(second.getByRole("button", { name: "Retry" }));
    expect(await second.findByTestId("student-e1")).toBeTruthy();
  });

  it("pages with Show more", async () => {
    api.list
      .mockResolvedValueOnce(page([student(1)], "next"))
      .mockResolvedValueOnce(page([student(2)]));
    await renderRouter(app, { initialUrl: "/manage/c1/students" });
    await screen.findByTestId("student-e1");
    await press("Show more");
    expect(await screen.findByTestId("student-e2")).toBeTruthy();
    expect(api.list).toHaveBeenLastCalledWith("c1", "next");
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });
});

describe("revoking", () => {
  const open = async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/students" });
    await screen.findByTestId("student-e1");
    await press("Revoke access for Student 1");
  };

  it("names the person, asks for a reason, and does nothing on Cancel", async () => {
    await open();
    expect(await screen.findByText("Revoke access?")).toBeTruthy();
    expect(screen.getByText(/Student 1 will lose access/)).toBeTruthy();
    await press("Cancel");
    expect(api.revoke).not.toHaveBeenCalled();
    expect(screen.getByTestId("student-e1")).toBeTruthy();
  });

  it("refuses a short reason at the field and sends nothing", async () => {
    await open();
    await screen.findByText("Revoke access?");
    await type("Reason", "ab");
    await press("Revoke access");
    expect(await screen.findByText("Write 3 to 200 characters")).toBeTruthy();
    expect(api.revoke).not.toHaveBeenCalled();
  });

  it("revokes with the reason, refreshes the list and closes the sheet", async () => {
    api.revoke.mockResolvedValue({ ...entitlement, status: "revoked" });
    await open();
    await screen.findByText("Revoke access?");
    await type("Reason", "  Chargeback upheld  ");
    api.list.mockResolvedValue(page([student(2)]));
    await press("Revoke access");
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith("c1", "e1", "Chargeback upheld"));
    await waitFor(() => expect(screen.queryByTestId("student-e1")).toBeNull());
    expect(screen.queryByText("Revoke access?")).toBeNull();
  });

  it("keeps the typed reason and shows the problem when the request fails", async () => {
    api.revoke.mockRejectedValue(appError("network"));
    await open();
    await screen.findByText("Revoke access?");
    await type("Reason", "Chargeback upheld");
    await press("Revoke access");
    expect(await screen.findByTestId("reason-error")).toBeTruthy();
    expect(screen.getByLabelText("Reason").props.value).toBe("Chargeback upheld");
    // Behind the open sheet the person is still listed.
    expect(screen.getByTestId("student-e1", { includeHiddenElements: true })).toBeTruthy();
  });
});

describe("granting access", () => {
  const open = async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/students/grant" });
    await screen.findByLabelText("Person's email");
  };
  const fill = async (email = "student@example.com", reason = "Paid by invoice") => {
    await type("Person's email", email);
    await type("Reason", reason);
  };

  it("validates beside the fields, keeps typed text and sends nothing", async () => {
    await open();
    await type("Reason", "ab");
    await press("Grant access");
    expect(await screen.findByText("Enter the person's email")).toBeTruthy();
    expect(screen.getByText("Write 3 to 200 characters")).toBeTruthy();
    expect(lookup).not.toHaveBeenCalled();
    expect(api.grant).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Reason").props.value).toBe("ab");
  });

  it("finds the person by email, grants with the reason, and returns to the list", async () => {
    lookup.mockResolvedValue({ id: "u9", displayName: "Nina", staffRole: null, status: "active" });
    api.grant.mockResolvedValue({ created: true, entitlement });
    await renderRouter(app, { initialUrl: "/manage/c1/students" });
    await screen.findByTestId("student-e1");
    await press("Grant access");
    await screen.findByLabelText("Person's email");
    await fill("  student@example.com  ", "  Paid by invoice ");
    await press("Grant access");
    await waitFor(() => expect(api.grant).toHaveBeenCalledWith("c1", "u9", "Paid by invoice"));
    expect(lookup).toHaveBeenCalledWith("student@example.com");
    await waitFor(() => expect(screen).toHavePathname("/manage/c1/students"));
  });

  it("says so when the person already has access, and changes nothing on screen by guesswork", async () => {
    lookup.mockResolvedValue({ id: "u9", displayName: null, staffRole: null, status: "active" });
    api.grant.mockResolvedValue({ created: false, entitlement });
    await open();
    await fill();
    await press("Grant access");
    expect(await screen.findByTestId("form-info")).toBeTruthy();
    expect(screen.getByLabelText(/already has access/)).toBeTruthy();
    expect(screen).toHavePathname("/manage/c1/students/grant");
  });

  it("shows an unknown email at the field and grants nothing", async () => {
    lookup.mockRejectedValue(appError("not_found"));
    await open();
    await fill("nobody@example.com");
    await press("Grant access");
    expect(await screen.findByText("No account uses that email.")).toBeTruthy();
    expect(api.grant).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Person's email").props.value).toBe("nobody@example.com");
  });

  it("explains an account that cannot be given access", async () => {
    lookup.mockResolvedValue({ id: "u9", displayName: null, staffRole: null, status: "active" });
    api.grant.mockRejectedValue(appError("conflict"));
    await open();
    await fill();
    await press("Grant access");
    expect(await screen.findByText(/need an active account with a verified email/)).toBeTruthy();
  });

  it("keeps typed text and says so when permission is removed meanwhile", async () => {
    lookup.mockResolvedValue({ id: "u9", displayName: null, staffRole: null, status: "active" });
    api.grant.mockRejectedValue(appError("forbidden"));
    await open();
    await fill();
    await press("Grant access");
    expect(await screen.findByText(/no longer have permission/)).toBeTruthy();
    expect(screen.getByLabelText("Reason").props.value).toBe("Paid by invoice");
  });

  it("sends one request when the button is pressed twice quickly", async () => {
    lookup.mockResolvedValue({ id: "u9", displayName: null, staffRole: null, status: "active" });
    let finish!: () => void;
    api.grant.mockImplementation(
      () => new Promise((r) => (finish = () => r({ created: true, entitlement }))),
    );
    await open();
    await fill();
    const b = screen.getByRole("button", { name: "Grant access" });
    await fireEvent.press(b);
    await fireEvent.press(b);
    await waitFor(() => expect(api.grant).toHaveBeenCalledTimes(1));
    expect(lookup).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });
});
