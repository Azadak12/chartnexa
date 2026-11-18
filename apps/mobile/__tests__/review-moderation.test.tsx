import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import * as SecureStore from "expo-secure-store";
import { courseApi, fetchAccess, staffCourseApi } from "../src/courses/course-api";
import { moderationApi } from "../src/reviews/moderation-api";
import { reviewsApi } from "../src/reviews/review-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";
import { mockBackHandler } from "../test-utils/back-handler";

jest.mock("../src/courses/course-api", () => ({
  ...jest.requireActual("../src/courses/course-api"),
  courseApi: { list: jest.fn(async () => ({ items: [], nextCursor: null })), get: jest.fn() },
  staffCourseApi: { list: jest.fn(), get: jest.fn() },
  fetchAccess: jest.fn(),
}));
jest.mock("../src/lessons/lesson-api", () => ({
  lessonApi: { outline: jest.fn(async () => ({ items: [] })), get: jest.fn() },
  staffLessonApi: {},
}));
jest.mock("../src/progress/progress-api", () => ({
  progressApi: {
    read: jest.fn(async () => ({ completed: 0, total: 0, nextLessonId: null, lessons: [] })),
    mark: jest.fn(),
    unmark: jest.fn(),
  },
}));
jest.mock("../src/reviews/review-api", () => ({
  reviewsApi: {
    list: jest.fn(),
    mine: jest.fn(),
    write: jest.fn(),
    remove: jest.fn(),
    report: jest.fn(),
    appeal: jest.fn(),
  },
}));
jest.mock("../src/reviews/moderation-api", () => ({
  moderationApi: {
    queue: jest.fn(),
    detail: jest.fn(),
    hide: jest.fn(),
    restore: jest.fn(),
    decide: jest.fn(),
  },
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

const reviews = reviewsApi as unknown as Record<
  "list" | "mine" | "report" | "appeal" | "write" | "remove",
  jest.Mock
>;
const mod = moderationApi as unknown as Record<
  "queue" | "detail" | "hide" | "restore" | "decide",
  jest.Mock
>;
const courses = courseApi as unknown as { get: jest.Mock };
const access = fetchAccess as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
mockBackHandler();
void staffCourseApi;
const app = "./app";
const hidden = { includeHiddenElements: true };

const MODERATOR = {
  roles: ["student", "manager"],
  permissions: ["reviews:moderate", "course:update"],
  courseGrants: [],
};
const ADMIN = { ...MODERATOR, roles: ["student", "admin"] };
const STUDENT = { roles: ["student"], permissions: [], courseGrants: [] };

const detail = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  title: "Price Action Basics",
  description: "Learn to read charts.",
  level: "beginner",
  priceCents: 4900,
  currency: "USD",
  coverTone: "blue",
  publishedAt: "2026-11-17T00:00:00.000Z",
  lessonCount: 0,
  previewCount: 0,
  enrolled: true,
  onSale: true,
  progress: null,
  nextLessonId: null,
  rating: { count: 2, average: 3 },
  ...over,
});
const review = (n: number, over: Record<string, unknown> = {}) => ({
  id: `r${n}`,
  rating: 3,
  body: `Review text ${n}`,
  createdAt: "2026-11-10T10:00:00.000Z",
  updatedAt: "2026-11-10T10:00:00.000Z",
  reviewerName: `Person ${n}`,
  mine: false,
  ...over,
});
const moderation = (over: Record<string, unknown> = {}) => ({
  state: "hidden",
  reason: "personal_info",
  note: "Contains a phone number",
  hiddenAt: "2026-11-18T10:00:00.000Z",
  canAppeal: true,
  appeal: null,
  ...over,
});
const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: `s${n}`,
  courseId: "c1",
  courseTitle: "Price Action Basics",
  rating: 1,
  body: `Staff row ${n}`,
  reviewerName: `Person ${n}`,
  createdAt: "2026-11-10T10:00:00.000Z",
  hidden: false,
  hiddenAt: null,
  hiddenReason: null,
  openReportCount: 2,
  openAppeal: false,
  activityAt: "2026-11-18T10:00:00.000Z",
  ...over,
});
const staffDetail = (over: Record<string, unknown> = {}) => ({
  ...row(1),
  hiddenNote: null,
  hiddenByMe: false,
  reports: [
    {
      id: "p1",
      reason: "spam",
      note: "An ad",
      createdAt: "2026-11-18T09:00:00.000Z",
      resolved: false,
    },
  ],
  appeals: [],
  ...over,
});
const page = (items: unknown[], nextCursor: string | null = null) => ({ items, nextCursor });
const press = (name: string) =>
  fireEvent.press(screen.getAllByRole("button", { name, ...hidden }).at(-1)!);
const radio = (name: string) => fireEvent.press(screen.getByRole("radio", { name, ...hidden }));
const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label, hidden), text);

let announce: jest.SpyInstance;
beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  access.mockResolvedValue(STUDENT);
  courses.get.mockResolvedValue(detail());
  reviews.list.mockResolvedValue(page([review(1), review(2)]));
  reviews.mine.mockResolvedValue({ review: null, moderation: null });
  reviews.report.mockResolvedValue(undefined);
  reviews.appeal.mockResolvedValue({ review: review(9, { mine: true }), moderation: null });
  mod.queue.mockResolvedValue(page([row(1)]));
  mod.detail.mockResolvedValue(staffDetail());
});

describe("reporting a review", () => {
  it("offers Report on other people's reviews only, and only when signed in", async () => {
    reviews.list.mockResolvedValue(page([review(1), review(2, { mine: true })]));
    await renderRouter(app, { initialUrl: "/course/c1" });
    await screen.findByTestId("review-r1");
    expect(screen.getByRole("button", { name: "Report review by Person 1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Report review by Person 2" })).toBeNull();
  });

  it("asks for a reason, sends it once, announces it and closes", async () => {
    await renderRouter(app, { initialUrl: "/course/c1" });
    await screen.findByTestId("review-r1");
    await fireEvent.press(screen.getByRole("button", { name: "Report review by Person 1" }));
    await press("Send report");
    expect(await screen.findByText("Choose a reason", hidden)).toBeTruthy();
    expect(reviews.report).not.toHaveBeenCalled();
    await radio("Abusive or harassing");
    await type("Details (optional)", "  Rude to others ");
    let release!: () => void;
    reviews.report.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    await press("Send report");
    await press("Send report");
    await press("Send report");
    expect(reviews.report).toHaveBeenCalledTimes(1);
    expect(reviews.report).toHaveBeenCalledWith("c1", "r1", {
      reason: "abusive",
      note: "Rude to others",
    });
    await act(async () => release());
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Report sent"));
    await waitFor(() => expect(screen.queryByText("Report this review", hidden)).toBeNull());
  });

  it("keeps the sheet open on failure, then succeeds on retry", async () => {
    reviews.report.mockRejectedValueOnce(appError("network"));
    await renderRouter(app, { initialUrl: "/course/c1" });
    await screen.findByTestId("review-r1");
    await fireEvent.press(screen.getByRole("button", { name: "Report review by Person 1" }));
    await radio("Spam or advertising");
    await press("Send report");
    expect(await screen.findByTestId("report-error", hidden)).toBeTruthy();
    await press("Send report");
    await waitFor(() => expect(reviews.report).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Report sent"));
  });

  it("says calmly when the review is no longer available", async () => {
    reviews.report.mockRejectedValueOnce(appError("not_found"));
    await renderRouter(app, { initialUrl: "/course/c1" });
    await screen.findByTestId("review-r1");
    await fireEvent.press(screen.getByRole("button", { name: "Report review by Person 1" }));
    await radio("Spam or advertising");
    await press("Send report");
    expect(
      await screen.findByLabelText("Error: This review is no longer available.", hidden),
    ).toBeTruthy();
  });

  it("has no reason about the rating, and labels every option in words", async () => {
    await renderRouter(app, { initialUrl: "/course/c1" });
    await screen.findByTestId("review-r1");
    await fireEvent.press(screen.getByRole("button", { name: "Report review by Person 1" }));
    for (const label of [
      "Spam or advertising",
      "Abusive or harassing",
      "Shares personal information",
      "Not about this course",
      "Something else",
    ]) {
      expect(screen.getByRole("radio", { name: label, ...hidden })).toBeTruthy();
    }
    expect(
      screen.queryByRole("radio", { name: /rating|star|low|disagree/i, ...hidden }),
    ).toBeNull();
  });
});

describe("the author's hidden review", () => {
  const own = review(9, { mine: true, rating: 1, body: "My honest words" });
  it("says it is hidden in words, with the reason and note, and keeps Edit and Delete", async () => {
    reviews.mine.mockResolvedValue({ review: own, moderation: moderation() });
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(await screen.findByTestId("hidden-banner")).toBeTruthy();
    expect(
      screen.getByLabelText("Warning: Hidden from other students. Only you can see this review."),
    ).toBeTruthy();
    expect(screen.getByTestId("hidden-reason").props.children.join("")).toContain(
      "Shares personal information",
    );
    expect(screen.getByText("Note from the moderator: Contains a phone number")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit your review" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete your review" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Appeal this decision" })).toBeTruthy();
  });

  it("shows no banner for a visible review", async () => {
    reviews.mine.mockResolvedValue({ review: own, moderation: null });
    await renderRouter(app, { initialUrl: "/course/c1" });
    await screen.findByRole("button", { name: "Edit your review" });
    expect(screen.queryByTestId("hidden-banner")).toBeNull();
  });

  it("sends one appeal, then shows it as sent and stops offering it", async () => {
    let sent = false;
    let release!: () => void;
    reviews.appeal.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            sent = true;
            resolve({ review: own, moderation: null });
          };
        }),
    );
    reviews.mine.mockImplementation(async () => ({
      review: own,
      moderation: sent
        ? moderation({
            canAppeal: false,
            appeal: {
              status: "open",
              message: "Fair",
              decidedNote: null,
              createdAt: "2026-11-18T11:00:00.000Z",
              decidedAt: null,
            },
          })
        : moderation(),
    }));
    await renderRouter(app, { initialUrl: "/course/c1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Appeal this decision" }));
    await press("Send appeal");
    expect(await screen.findByText("Tell us why you are appealing", hidden)).toBeTruthy();
    expect(reviews.appeal).not.toHaveBeenCalled();
    await type("Your message", "  This was honest feedback.  ");
    await press("Send appeal");
    await press("Send appeal");
    expect(reviews.appeal).toHaveBeenCalledTimes(1);
    await act(async () => release());
    expect(reviews.appeal).toHaveBeenCalledWith("c1", "This was honest feedback.");
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Appeal sent"));
    expect(await screen.findByText("Appeal sent. A moderator will decide.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Appeal this decision" })).toBeNull();
  });

  it("shows the outcome and the moderator's note after a decision", async () => {
    reviews.mine.mockResolvedValue({
      review: own,
      moderation: moderation({
        canAppeal: false,
        appeal: {
          status: "upheld",
          message: "Fair",
          decidedNote: "Still shares a number",
          createdAt: "2026-11-18T11:00:00.000Z",
          decidedAt: "2026-11-18T12:00:00.000Z",
        },
      }),
    });
    await renderRouter(app, { initialUrl: "/course/c1" });
    expect(
      await screen.findByText(
        "Appeal decided: the review stays hidden. Moderator's note: Still shares a number",
      ),
    ).toBeTruthy();
  });

  it("treats an already-appealed answer as done, without an error", async () => {
    reviews.mine.mockResolvedValue({ review: own, moderation: moderation() });
    reviews.appeal.mockRejectedValueOnce(appError("conflict"));
    await renderRouter(app, { initialUrl: "/course/c1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Appeal this decision" }));
    await type("Your message", "Please look again");
    await press("Send appeal");
    await waitFor(() => expect(announce).toHaveBeenCalledWith("You have already appealed this"));
  });
});

describe("the moderators' screens", () => {
  it("offer the entry only to moderators", async () => {
    access.mockResolvedValue(MODERATOR);
    await renderRouter(app, { initialUrl: "/profile" });
    expect(await screen.findByRole("button", { name: "Review moderation" })).toBeTruthy();
    await screen.unmount();
    access.mockResolvedValue(STUDENT);
    await renderRouter(app, { initialUrl: "/profile" });
    await screen.findByRole("button", { name: "Edit name" });
    expect(screen.queryByRole("button", { name: "Review moderation" })).toBeNull();
  });

  it("show a clear message, and no data, to people without the permission", async () => {
    await renderRouter(app, { initialUrl: "/profile/reviews" });
    expect(await screen.findByText("You do not have access")).toBeTruthy();
    expect(mod.queue).not.toHaveBeenCalled();
  });

  it("list the tabs with states in words, and open a review", async () => {
    access.mockResolvedValue(MODERATOR);
    mod.queue.mockImplementation(async (tab: string) =>
      tab === "hidden"
        ? page([
            row(2, { hidden: true, hiddenReason: "spam", openReportCount: 0, openAppeal: true }),
          ])
        : tab === "appeals"
          ? page([])
          : page([row(1)]),
    );
    await renderRouter(app, { initialUrl: "/profile/reviews" });
    expect(await screen.findByText("2 open reports")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Hidden" }));
    expect(await screen.findByText("Hidden: Spam or advertising")).toBeTruthy();
    expect(screen.getByText("Appeal waiting")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Appeals" }));
    expect(await screen.findByText("No appeals waiting.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Reported" }));
    await fireEvent.press(await screen.findByTestId("staff-review-s1"));
    expect(await screen.findByTestId("staff-review-body")).toBeTruthy();
    expect(screen.getByText("Visible to everyone")).toBeTruthy();
  });

  it("show an error with Try again, and an offline state", async () => {
    access.mockResolvedValue(MODERATOR);
    mod.queue.mockRejectedValueOnce(appError("unknown"));
    await renderRouter(app, { initialUrl: "/profile/reviews" });
    await fireEvent.press(await screen.findByRole("button", { name: /retry/i }));
    expect(await screen.findByText("2 open reports")).toBeTruthy();
  });

  it("hide a review: needs a reason, explains the note, needs 10+ characters for 'other'", async () => {
    access.mockResolvedValue(MODERATOR);
    mod.hide.mockResolvedValue({
      changed: true,
      review: staffDetail({
        hidden: true,
        hiddenReason: "other",
        hiddenNote: "Contains a phone number",
        openReportCount: 0,
      }),
    });
    await renderRouter(app, { initialUrl: "/profile/reviews/s1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Hide review" }));
    expect(screen.getByText(/The author will see the reason and your note/, hidden)).toBeTruthy();
    await press("Hide review");
    expect(await screen.findByText("Choose a reason", hidden)).toBeTruthy();
    await radio("Something else");
    await type("Note for the author", "too short");
    await press("Hide review");
    expect(await screen.findByText("Explain in at least 10 characters", hidden)).toBeTruthy();
    expect(mod.hide).not.toHaveBeenCalled();
    await type("Note for the author", "Contains a phone number");
    let release!: () => void;
    mod.hide.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              changed: true,
              review: staffDetail({
                hidden: true,
                hiddenReason: "other",
                hiddenNote: "Contains a phone number",
                openReportCount: 0,
              }),
            });
        }),
    );
    await press("Hide review");
    await press("Hide review");
    await waitFor(() => expect(mod.hide).toHaveBeenCalledTimes(1));
    await act(async () => release());
    await waitFor(() => expect(mod.hide).toHaveBeenCalledTimes(1));
    expect(mod.hide).toHaveBeenCalledWith("s1", {
      reason: "other",
      note: "Contains a phone number",
    });
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Review hidden"));
    expect(await screen.findByText(/^Hidden: Something else/)).toBeTruthy();
  });

  it("restore a hidden review after confirming", async () => {
    access.mockResolvedValue(MODERATOR);
    mod.detail.mockResolvedValue(
      staffDetail({ hidden: true, hiddenReason: "spam", hiddenNote: "Ad" }),
    );
    mod.restore.mockResolvedValue({ changed: true, review: staffDetail() });
    await renderRouter(app, { initialUrl: "/profile/reviews/s1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Restore review" }));
    expect(mod.restore).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getAllByRole("button", { name: "Restore review", ...hidden }).at(-1)!,
    );
    await waitFor(() => expect(mod.restore).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Review restored"));
    expect(await screen.findByText("Visible to everyone")).toBeTruthy();
  });

  it("decide an appeal, and tell the moderator who hid it to wait unless they are an Admin", async () => {
    access.mockResolvedValue(MODERATOR);
    const appeal = {
      id: "a1",
      status: "open",
      message: "Honest",
      decidedNote: null,
      createdAt: "2026-11-18T11:00:00.000Z",
      decidedAt: null,
      hiddenAt: "2026-11-18T10:00:00.000Z",
    };
    mod.detail.mockResolvedValue(
      staffDetail({
        hidden: true,
        hiddenReason: "spam",
        hiddenNote: "",
        appeals: [appeal],
        hiddenByMe: true,
      }),
    );
    await renderRouter(app, { initialUrl: "/profile/reviews/s1" });
    expect(await screen.findByTestId("must-wait")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Decide appeal" })).toBeNull();
    await screen.unmount();

    access.mockResolvedValue(ADMIN);
    mod.decide.mockResolvedValue({ changed: true, review: staffDetail() });
    await renderRouter(app, { initialUrl: "/profile/reviews/s1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Decide appeal" }));
    await press("Save decision");
    expect(await screen.findByText("Choose uphold or overturn", hidden)).toBeTruthy();
    await radio("Overturn: show the review again");
    await press("Save decision");
    await waitFor(() =>
      expect(mod.decide).toHaveBeenCalledWith("a1", { decision: "overturn", note: "" }),
    );
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Decision saved"));
  });

  it("explain a refusal from the server instead of failing silently", async () => {
    access.mockResolvedValue(MODERATOR);
    mod.hide.mockRejectedValueOnce(appError("forbidden"));
    await renderRouter(app, { initialUrl: "/profile/reviews/s1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Hide review" }));
    await radio("Spam or advertising");
    await press("Hide review");
    expect(await screen.findByTestId("staff-review-error")).toBeTruthy();
    expect(screen.getByText(/can no longer do this/)).toBeTruthy();
  });
});
