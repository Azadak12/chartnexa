import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import * as SecureStore from "expo-secure-store";
import { fetchAccess } from "../src/courses/course-api";
import { assignmentApi, staffAssignmentApi } from "../src/assignments/assignment-api";
import { attachmentPicker } from "../src/assignments/AssignmentFormScreen";
import { fileOpener } from "../src/resources/LessonFilesSection";
import { fileReader } from "../src/resources/upload";
import { staffLessonApi } from "../src/lessons/lesson-api";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { AppError } from "../src/api/errors";
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
const MANAGER = {
  roles: ["student", "manager"],
  permissions: ["assignments:manage"],
  courseGrants: [],
};
const STUDENT = { roles: ["student"], permissions: [], courseGrants: [] };
const future = new Date(Date.now() + 5 * 86_400_000).toISOString();

const mine = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  courseId: "c1",
  courseTitle: "Candlestick Chart Mastery",
  title: "Identify chart patterns",
  dueAt: future,
  state: "to_do",
  overdue: false,
  assignedAt: "2026-11-19T10:00:00.000Z",
  ...over,
});
const detail = (over: Record<string, unknown> = {}) => ({
  ...mine(),
  instructions: "Describe the patterns you see.",
  lessonId: null,
  attachment: { name: "charts.pdf", mimeType: "application/pdf", sizeBytes: 2048 },
  submission: null,
  ...over,
});
const submission = (over: Record<string, unknown> = {}) => ({
  body: "I see a double top.",
  status: "submitted",
  late: false,
  submittedAt: "2026-11-19T12:00:00.000Z",
  feedback: null,
  reviewedAt: null,
  ...over,
});
const staff = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  courseId: "c1",
  lessonId: null,
  lessonTitle: null,
  title: "Identify chart patterns",
  instructions: "Describe the patterns you see.",
  dueAt: null,
  status: "draft",
  version: 1,
  attachment: null,
  createdAt: "2026-11-19T10:00:00.000Z",
  assignedCount: 0,
  submittedCount: 0,
  reviewedCount: 0,
  ...over,
});

let announce: jest.SpyInstance;
let s: Record<string, jest.SpyInstance>;
beforeEach(async () => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  access.mockResolvedValue(STUDENT);
  s = {
    list: jest.spyOn(assignmentApi, "list").mockResolvedValue([]),
    get: jest.spyOn(assignmentApi, "get").mockResolvedValue(detail() as never),
    submit: jest.spyOn(assignmentApi, "submit"),
    link: jest.spyOn(assignmentApi, "attachmentLink"),
    sList: jest.spyOn(staffAssignmentApi, "list").mockResolvedValue([]),
    sGet: jest.spyOn(staffAssignmentApi, "get").mockResolvedValue(staff() as never),
    sCreate: jest.spyOn(staffAssignmentApi, "create"),
    sUpdate: jest.spyOn(staffAssignmentApi, "update"),
    sSetFile: jest.spyOn(staffAssignmentApi, "setAttachment"),
    sRemoveFile: jest.spyOn(staffAssignmentApi, "removeAttachment"),
    sEnrolled: jest.spyOn(staffAssignmentApi, "enrolled").mockResolvedValue([]),
    sAssign: jest.spyOn(staffAssignmentApi, "assign"),
    sRecipients: jest.spyOn(staffAssignmentApi, "recipients").mockResolvedValue([]),
    sSubmission: jest.spyOn(staffAssignmentApi, "submission"),
    sFeedback: jest.spyOn(staffAssignmentApi, "feedback"),
    lessons: jest
      .spyOn(staffLessonApi, "list")
      .mockResolvedValue({ items: [{ id: "l1", title: "Reading candles" }], modules: [] } as never),
    download: jest.spyOn(fileOpener, "download").mockResolvedValue(true as never),
  };
});

describe("the student's assignments", () => {
  it("lists work with course, due date, state and overdue marking, and has an empty state", async () => {
    await renderRouter(app, { initialUrl: "/assignments" });
    expect(await screen.findByText("No assignments yet")).toBeTruthy();
    await screen.unmount();
    s.list!.mockResolvedValue([
      mine(),
      mine({ id: "a2", title: "Risk plan", overdue: true, dueAt: "2026-11-01T10:00:00.000Z" }),
      mine({ id: "a3", title: "Done one", state: "reviewed" }),
    ] as never);
    await renderRouter(app, { initialUrl: "/assignments" });
    expect(await screen.findByText("Identify chart patterns")).toBeTruthy();
    expect(screen.getByText(/^Overdue · Due /)).toBeTruthy();
    expect(screen.getByText("Reviewed")).toBeTruthy();
    expect(screen.getAllByText("To do")).toHaveLength(2);
    expect(screen.getByText("To do (2)")).toBeTruthy();
    expect(screen.getByText("Reviewed (1)")).toBeTruthy();
    expect(screen.queryByText(/^Submitted \(/)).toBeNull();
    await fireEvent.press(screen.getByTestId("assignment-a1"));
    expect(screen).toHavePathname("/assignment/a1");
    expect(await screen.findByTestId("assignment-instructions")).toBeTruthy();
  });

  it("shows an error with Retry", async () => {
    s.list!.mockRejectedValueOnce(appError("unknown"));
    await renderRouter(app, { initialUrl: "/assignments" });
    await fireEvent.press(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No assignments yet")).toBeTruthy();
  });

  it("shows instructions, opens the attachment through a fresh link, and hands in an answer once", async () => {
    s.link!.mockResolvedValue({ url: "/assignment-files/a1?t=abc", expiresAt: future });
    let release!: (v: unknown) => void;
    s.submit!.mockImplementationOnce(() => new Promise((r) => (release = r)));
    await renderRouter(app, { initialUrl: "/assignment/a1" });
    expect(await screen.findByText("Describe the patterns you see.")).toBeTruthy();
    expect(screen.getByText("charts.pdf")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Download charts.pdf" }));
    await waitFor(() =>
      expect(s.download).toHaveBeenCalledWith(
        expect.stringContaining("/assignment-files/a1?t=abc"),
      ),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Hand in" }));
    expect(await screen.findByText("Write your answer")).toBeTruthy();
    expect(s.submit).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Your answer"), "  I see a double top.  ");
    await fireEvent.press(screen.getByRole("button", { name: "Hand in" }));
    await fireEvent.press(screen.getByRole("button", { name: "Hand in" }));
    expect(s.submit).toHaveBeenCalledTimes(1);
    expect(s.submit).toHaveBeenCalledWith("a1", "I see a double top.");
    s.get!.mockResolvedValue(detail({ state: "submitted", submission: submission() }) as never);
    await act(async () => release(submission()));
    expect(await screen.findByText(/Handed in\. Well done\./)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Handed in. Well done.");
    expect(await screen.findByRole("button", { name: "Update answer" })).toBeTruthy();
  });

  it("shows feedback and locks the answer once reviewed, and explains a lock that happened meanwhile", async () => {
    s.get!.mockResolvedValue(
      detail({
        state: "reviewed",
        submission: submission({
          status: "reviewed",
          feedback: "Good eye.",
          reviewedAt: "2026-11-20T10:00:00.000Z",
        }),
      }) as never,
    );
    await renderRouter(app, { initialUrl: "/assignment/a1" });
    expect(await screen.findByTestId("assignment-feedback")).toBeTruthy();
    expect(screen.getByText("Good eye.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Update answer" })).toBeNull();
    expect(screen.getByText("Reviewed, so it can no longer change.")).toBeTruthy();
    await screen.unmount();
    s.get!.mockResolvedValue(detail({ state: "submitted", submission: submission() }) as never);
    s.submit!.mockRejectedValueOnce(
      new AppError("conflict", "Locked", 409, null, [], null, "SUBMISSION_LOCKED"),
    );
    await renderRouter(app, { initialUrl: "/assignment/a1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Update answer" }));
    expect(await screen.findByText(/has been reviewed, so it can no longer change/)).toBeTruthy();
  });

  it("explains an assignment that is gone", async () => {
    s.get!.mockRejectedValue(appError("not_found"));
    await renderRouter(app, { initialUrl: "/assignment/a9" });
    expect(await screen.findByText("Assignment not found")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back to assignments" }));
    await waitFor(() => expect(screen).toHavePathname("/assignments"));
  });
});

describe("staff", () => {
  beforeEach(() => access.mockResolvedValue(MANAGER));

  it("refuses people without the permission", async () => {
    access.mockResolvedValue(STUDENT);
    await renderRouter(app, { initialUrl: "/manage/c1/assignments" });
    expect(
      await screen.findByText("You need permission to manage assignments for this course."),
    ).toBeTruthy();
    expect(s.sList).not.toHaveBeenCalled();
  });

  it("lists assignments with status and counts", async () => {
    await renderRouter(app, { initialUrl: "/manage/c1/assignments" });
    expect(await screen.findByText("No assignments yet")).toBeTruthy();
    await screen.unmount();
    s.sList!.mockResolvedValue([
      staff({ status: "published", assignedCount: 4, submittedCount: 2, reviewedCount: 1 }),
      staff({ id: "a2", title: "Draft one" }),
    ] as never);
    await renderRouter(app, { initialUrl: "/manage/c1/assignments" });
    expect(await screen.findByText("4 assigned · 2 handed in · 1 reviewed")).toBeTruthy();
    expect(screen.getByText(/^Draft · /)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Open Identify chart patterns" }));
    expect(screen).toHavePathname("/manage/c1/assignments/a1");
  });

  it("creates a draft, stays to add an attachment, then publishes", async () => {
    s.sCreate!.mockResolvedValue(staff() as never);
    jest.spyOn(attachmentPicker, "pick").mockResolvedValue({
      uri: "file:///c.pdf",
      name: "charts.pdf",
      size: 2048,
      mimeType: "application/pdf",
    });
    jest.spyOn(fileReader, "readPart").mockResolvedValue(new Uint8Array([1, 2, 3]));
    s.sSetFile!.mockResolvedValue(
      staff({
        version: 2,
        attachment: { name: "charts.pdf", mimeType: "application/pdf", sizeBytes: 2048 },
      }) as never,
    );
    s.sUpdate!.mockResolvedValue(staff({ version: 3, status: "published" }) as never);
    await renderRouter(app, { initialUrl: "/manage/c1/assignments/new" });
    await fireEvent.press(await screen.findByRole("button", { name: "Save as draft" }));
    expect(await screen.findByText("Use 3 to 120 characters")).toBeTruthy();
    expect(s.sCreate).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Title"), "Identify chart patterns");
    await fireEvent.changeText(
      screen.getByLabelText("Instructions"),
      "Describe the patterns you see.",
    );
    await fireEvent.changeText(screen.getByLabelText("Date (year-month-day)"), "2030-02-30");
    await fireEvent.changeText(screen.getByLabelText("Time (24-hour)"), "10:00");
    await fireEvent.press(screen.getByRole("button", { name: "Save as draft" }));
    expect(await screen.findByText("Give both a real date and a time")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Date (year-month-day)"), "");
    await fireEvent.changeText(screen.getByLabelText("Time (24-hour)"), "");
    await fireEvent.press(await screen.findByText("Reading candles"));
    await fireEvent.press(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(s.sCreate).toHaveBeenCalledTimes(1));
    expect(s.sCreate).toHaveBeenCalledWith("c1", {
      title: "Identify chart patterns",
      instructions: "Describe the patterns you see.",
      lessonId: "l1",
      dueAt: null,
      status: "draft",
    });
    expect(
      await screen.findByText(/Saved as a draft\. You can add an attachment now\./),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Add attachment" }));
    expect(await screen.findByText(/Attachment saved\./)).toBeTruthy();
    expect(s.sSetFile).toHaveBeenCalledWith("c1", "a1", "charts.pdf", expect.any(Uint8Array));
    await fireEvent.press(screen.getByRole("button", { name: "Save and publish" }));
    await waitFor(() => expect(s.sUpdate).toHaveBeenCalled());
    expect(s.sUpdate!.mock.calls[0]![2]).toMatchObject({ expectedVersion: 2, status: "published" });
  });

  it("refuses an oversized attachment without sending it", async () => {
    s.sGet!.mockResolvedValue(staff() as never);
    jest.spyOn(attachmentPicker, "pick").mockResolvedValue({
      uri: "file:///big.pdf",
      name: "big.pdf",
      size: 9 * 1024 * 1024,
      mimeType: "application/pdf",
    });
    await renderRouter(app, { initialUrl: "/manage/c1/assignments/a1/edit" });
    await fireEvent.press(await screen.findByRole("button", { name: "Add attachment" }));
    expect(await screen.findByTestId("assignment-form-msg")).toBeTruthy();
    expect(screen.getByText(/Attachments can be up to 4 MB\./)).toBeTruthy();
    expect(s.sSetFile).not.toHaveBeenCalled();
  });

  it("assigns to everyone or chosen students and reports what happened", async () => {
    s.sGet!.mockResolvedValue(staff({ status: "published" }) as never);
    s.sEnrolled!.mockResolvedValue([
      { userId: "u1", displayName: "Sam Student", email: "sam@example.com" },
      { userId: "u2", displayName: null, email: "pat@example.com" },
    ]);
    s.sAssign!.mockResolvedValueOnce({ assigned: 2, alreadyAssigned: 0 })
      .mockRejectedValueOnce(appError("validation"))
      .mockResolvedValueOnce({ assigned: 0, alreadyAssigned: 1 });
    await renderRouter(app, { initialUrl: "/manage/c1/assignments/a1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Assign to students" }));
    await fireEvent.press(screen.getByRole("button", { name: "Assign", ...hidden }));
    await waitFor(() => expect(s.sAssign).toHaveBeenCalledWith("c1", "a1", { all: true }));
    expect(await screen.findByText(/Assigned to 2 students\./)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Assign to students" }));
    await fireEvent.press(screen.getByText("Choose students", hidden));
    await fireEvent.press(screen.getByRole("button", { name: "Assign", ...hidden }));
    expect(
      await screen.findByText(/Choose at least one student, or everyone\./, hidden),
    ).toBeTruthy();
    await fireEvent.press(await screen.findByText("Sam Student", hidden));
    await fireEvent.press(screen.getByRole("button", { name: "Assign", ...hidden }));
    expect(await screen.findByTestId("assign-error", hidden)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Assign", ...hidden }));
    expect(await screen.findByText(/Everyone chosen already had this assignment\./)).toBeTruthy();
    expect(s.sAssign).toHaveBeenLastCalledWith("c1", "a1", { userIds: ["u1"] });
  });

  it("offers Publish for drafts, and reviews handed-in work with feedback", async () => {
    s.sGet!.mockResolvedValue(staff() as never);
    s.sUpdate!.mockResolvedValue(staff({ status: "published", version: 2 }) as never);
    await renderRouter(app, { initialUrl: "/manage/c1/assignments/a1" });
    expect(
      await screen.findByText(/Students see an assignment only after it is published/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Assign to students" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(s.sUpdate).toHaveBeenCalledWith("c1", "a1", {
        expectedVersion: 1,
        status: "published",
      }),
    );
    await screen.unmount();

    s.sGet!.mockResolvedValue(
      staff({ status: "published", assignedCount: 2, submittedCount: 1 }) as never,
    );
    s.sRecipients!.mockResolvedValue([
      {
        userId: "u1",
        displayName: "Sam Student",
        email: "sam@example.com",
        assignedAt: "2026-11-19T10:00:00.000Z",
        state: "submitted",
        submittedAt: "2026-11-19T12:00:00.000Z",
      },
      {
        userId: "u2",
        displayName: "Pat Student",
        email: "pat@example.com",
        assignedAt: "2026-11-19T10:00:00.000Z",
        state: "not_started",
        submittedAt: null,
      },
    ]);
    s.sSubmission!.mockResolvedValue({
      ...submission(),
      userId: "u1",
      displayName: "Sam Student",
    } as never);
    s.sFeedback!.mockResolvedValue({
      ...submission({ status: "reviewed", feedback: "Nice." }),
      userId: "u1",
      displayName: "Sam Student",
    } as never);
    await renderRouter(app, { initialUrl: "/manage/c1/assignments/a1" });
    expect(await screen.findByText("Sam Student")).toBeTruthy();
    expect(screen.getByText("Not started")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review work of Pat Student" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Review work of Sam Student" }));
    expect(await screen.findByTestId("submission-body", hidden)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Send feedback", ...hidden }));
    expect(await screen.findByText("Write your feedback", hidden)).toBeTruthy();
    expect(s.sFeedback).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Feedback", hidden), "Nice.");
    await fireEvent.press(screen.getByRole("button", { name: "Send feedback", ...hidden }));
    await waitFor(() => expect(s.sFeedback).toHaveBeenCalledWith("c1", "a1", "u1", "Nice."));
    expect(await screen.findByText(/Feedback sent\. The work is now reviewed\./)).toBeTruthy();
  });
});
