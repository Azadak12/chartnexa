import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import { fetchAccess } from "../src/courses/course-api";
import { opsApi } from "../src/ops/ops-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";

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
const app = "./app";
const ADMIN = {
  roles: ["student", "admin"],
  permissions: ["audit:read", "payments:read_status"],
  courseGrants: [],
};
const MANAGER = {
  roles: ["student", "manager"],
  permissions: ["payments:read_status"],
  courseGrants: [],
};
const STUDENT = { roles: ["student"], permissions: [], courseGrants: [] };

const event = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  occurredAt: "2026-11-19T10:00:00.000Z",
  actorKind: "user",
  actorUserId: "aaaaaaaa-1111-4111-8111-111111111111",
  action: "review.hide",
  targetType: "course_review",
  targetId: "bbbbbbbb-2222-4222-8222-222222222222",
  outcome: "success",
  reason: "Spam link",
  before: { status: "visible" },
  after: { status: "hidden" },
  requestId: "req-1",
  ...over,
});
const order = (over: Record<string, unknown> = {}) => ({
  id: "cccccccc-3333-4333-8333-333333333333",
  courseId: "c1",
  courseTitle: "Price Action",
  amountCents: 4900,
  currency: "USD",
  status: "paid",
  provider: "test",
  testMode: true,
  checkoutRef: "test_cs_1",
  createdAt: "2026-11-19T10:00:00.000Z",
  paidAt: "2026-11-19T10:01:00.000Z",
  userId: "dddddddd-4444-4444-8444-444444444444",
  ...over,
});

let audit: jest.SpyInstance;
let orders: jest.SpyInstance;
beforeEach(async () => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  access.mockResolvedValue(ADMIN);
  audit = jest.spyOn(opsApi, "audit").mockResolvedValue({ items: [], nextCursor: null });
  orders = jest.spyOn(opsApi, "orders").mockResolvedValue({ items: [], nextCursor: null });
});

describe("entries on Profile", () => {
  it("show Orders and Audit log only to people who hold the permissions", async () => {
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByRole("button", { name: "Audit log" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Orders" })).toBeTruthy();
    await screen.unmount();
    access.mockResolvedValue(MANAGER);
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByRole("button", { name: "Orders" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Audit log" })).toBeNull();
    await screen.unmount();
    access.mockResolvedValue(STUDENT);
    await renderRouter(app, { initialUrl: "/profile" });
    await screen.findByRole("button", { name: "Edit name" });
    expect(screen.queryByRole("button", { name: "Orders" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Audit log" })).toBeNull();
  });
});

describe("the audit log", () => {
  it("refuses people without the permission and asks the server nothing", async () => {
    access.mockResolvedValue(MANAGER);
    await renderRouter(app, { initialUrl: "/profile/audit" });
    expect(await screen.findByText("Only Admins can read the audit log.")).toBeTruthy();
    expect(audit).not.toHaveBeenCalled();
  });

  it("lists records, shows details on demand, and filters by outcome and action", async () => {
    audit.mockResolvedValue({
      items: [
        event(),
        event({
          id: "e2",
          outcome: "denied",
          action: "audit.read",
          actorKind: "user",
          reason: null,
          before: null,
          after: null,
        }),
      ],
      nextCursor: null,
    });
    await renderRouter(app, { initialUrl: "/profile/audit" });
    expect(await screen.findByText("review hide")).toBeTruthy();
    expect(screen.getByText("Reason: Spam link")).toBeTruthy();
    expect(screen.getAllByText(/By person aaaaaaaa · course review bbbbbbbb/)).toHaveLength(2);
    expect(screen.getByText(/^Denied ·/)).toBeTruthy();
    expect(screen.queryByTestId("audit-details-e1")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Show details of review hide" }));
    expect(screen.getByTestId("audit-details-e1")).toBeTruthy();
    expect(screen.getByText(/"status": "hidden"/)).toBeTruthy();
    expect(screen.getByText(/Request req-1/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Hide details of review hide" }));
    expect(screen.queryByTestId("audit-details-e1")).toBeNull();

    await fireEvent.press(screen.getByText("Denied", { exact: true }));
    await waitFor(() =>
      expect(audit).toHaveBeenLastCalledWith({
        outcome: "denied",
        action: undefined,
        cursor: undefined,
      }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("Action (for example review.hide)"),
      "  live.cancel ",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    await waitFor(() =>
      expect(audit).toHaveBeenLastCalledWith({
        outcome: "denied",
        action: "live.cancel",
        cursor: undefined,
      }),
    );
  });

  it("offers to clear filters when nothing matches, and pages with Load more", async () => {
    audit.mockResolvedValue({ items: [], nextCursor: null });
    await renderRouter(app, { initialUrl: "/profile/audit" });
    expect(await screen.findByText("No records yet")).toBeTruthy();
    await fireEvent.press(screen.getByText("Denied", { exact: true }));
    expect(await screen.findByText("Nothing matches")).toBeTruthy();
    audit.mockReset();
    audit.mockResolvedValueOnce({ items: [event()], nextCursor: "next" }).mockResolvedValueOnce({
      items: [event({ id: "e9", action: "course.publish" })],
      nextCursor: null,
    });
    await fireEvent.press(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("review hide")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("course publish")).toBeTruthy();
    expect(audit).toHaveBeenLastCalledWith({
      outcome: undefined,
      action: undefined,
      cursor: "next",
    });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("shows an error with Retry", async () => {
    audit.mockRejectedValueOnce(appError("unknown"));
    await renderRouter(app, { initialUrl: "/profile/audit" });
    await fireEvent.press(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No records yet")).toBeTruthy();
  });
});

describe("staff orders", () => {
  it("refuses students and lists orders with staff wording for Managers", async () => {
    access.mockResolvedValue(STUDENT);
    await renderRouter(app, { initialUrl: "/profile/orders" });
    expect(await screen.findByText("Only Admins and Managers can see orders.")).toBeTruthy();
    expect(orders).not.toHaveBeenCalled();
    await screen.unmount();
    access.mockResolvedValue(MANAGER);
    orders.mockResolvedValue({
      items: [order(), order({ id: "o2", status: "duplicate_needs_refund" })],
      nextCursor: null,
    });
    await renderRouter(app, { initialUrl: "/profile/orders" });
    expect(await screen.findByText("$49.00 · Paid")).toBeTruthy();
    expect(screen.getByText("$49.00 · Paid twice, needs a refund decision")).toBeTruthy();
    expect(screen.getAllByText(/Buyer dddddddd · Order/).length).toBe(2);
  });

  it("filters by status and has an empty state", async () => {
    await renderRouter(app, { initialUrl: "/profile/orders" });
    expect(await screen.findByText("No orders yet")).toBeTruthy();
    await fireEvent.press(screen.getByText("Reversed, access removed"));
    await waitFor(() =>
      expect(orders).toHaveBeenLastCalledWith({ status: "reversed", cursor: undefined }),
    );
    expect(await screen.findByText("No orders with this status")).toBeTruthy();
  });
});
