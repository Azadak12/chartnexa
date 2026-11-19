import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import * as SecureStore from "expo-secure-store";
import { courseApi, fetchAccess } from "../src/courses/course-api";
import { lessonApi, staffLessonApi } from "../src/lessons/lesson-api";
import { fileOpener } from "../src/resources/LessonFilesSection";
import { resourceApi, staffResourceApi } from "../src/resources/resource-api";
import { filePicker } from "../src/resources/StaffLessonFiles";
import { describeFile, fileReader, mimeFor, uploadFile } from "../src/resources/upload";
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
jest.mock("../src/lessons/lesson-api", () => ({
  lessonApi: { outline: jest.fn(), get: jest.fn() },
  staffLessonApi: { get: jest.fn() },
}));
jest.mock("../src/progress/progress-api", () => ({
  progressApi: { read: jest.fn(), mark: jest.fn(), unmark: jest.fn() },
}));
jest.mock("../src/resources/resource-api", () => ({
  resourceApi: { list: jest.fn(), link: jest.fn() },
  staffResourceApi: {
    list: jest.fn(),
    start: jest.fn(),
    putPart: jest.fn(),
    complete: jest.fn(),
    cancel: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
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

const pub = resourceApi as unknown as Record<"list" | "link", jest.Mock>;
const staff = staffResourceApi as unknown as Record<
  "list" | "start" | "putPart" | "complete" | "cancel" | "update" | "remove",
  jest.Mock
>;
const lessons = lessonApi as unknown as { get: jest.Mock };
const staffLessons = staffLessonApi as unknown as { get: jest.Mock };
const courses = courseApi as unknown as { get: jest.Mock };
const access = fetchAccess as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
mockBackHandler();
const app = "./app";
const hidden = { includeHiddenElements: true };
const MANAGER = {
  roles: ["student", "manager"],
  permissions: ["lesson:upload", "course:update"],
  courseGrants: [],
};

const file = (over: Record<string, unknown> = {}) => ({
  id: "f1",
  title: "Chart notes",
  fileName: "notes.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024 * 1024,
  downloadable: false,
  ...over,
});
const staffFile = (over: Record<string, unknown> = {}) => ({
  ...file(),
  lessonId: "l1",
  scanStatus: "not_scanned",
  version: 1,
  createdAt: "2026-11-18T00:00:00.000Z",
  updatedAt: "2026-11-18T00:00:00.000Z",
  ...over,
});
const press = (name: string) =>
  fireEvent.press(screen.getAllByRole("button", { name, ...hidden }).at(-1)!);

let announce: jest.SpyInstance;
let view: jest.SpyInstance;
let download: jest.SpyInstance;
beforeEach(async () => {
  jest.clearAllMocks();
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  view = jest.spyOn(fileOpener, "view").mockResolvedValue({} as never);
  download = jest.spyOn(fileOpener, "download").mockResolvedValue(true as never);
  access.mockResolvedValue(MANAGER);
  staff.cancel.mockResolvedValue(undefined);
  staff.remove.mockResolvedValue(undefined);
  courses.get.mockResolvedValue({
    id: "c1",
    title: "Course",
    description: "d",
    level: "beginner",
    priceCents: 0,
    currency: "USD",
    coverTone: "blue",
    publishedAt: "2026-11-17T00:00:00.000Z",
    lessonCount: 1,
    previewCount: 1,
  });
  lessons.get.mockResolvedValue({
    id: "l1",
    title: "Candles",
    position: 1,
    isPreview: true,
    body: "Text.",
  });
  pub.list.mockResolvedValue([
    file(),
    file({
      id: "f2",
      title: "Worksheet",
      downloadable: true,
      mimeType: "image/png",
      sizeBytes: 2048,
    }),
  ]);
  pub.link.mockResolvedValue({
    url: "/files/f1?t=abc",
    expiresAt: "2026-11-19T00:05:00.000Z",
    download: false,
  });
});

describe("helpers", () => {
  it("describe files in words and pick a type from the name when the picker gives none", () => {
    expect(describeFile("application/pdf", 1024 * 1024 * 1.25)).toBe("PDF, 1.3 MB");
    expect(describeFile("image/png", 2048)).toBe("PNG image, 2 KB");
    expect(mimeFor("a.DOCX")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(mimeFor("a.pdf", "application/octet-stream")).toBe("application/pdf");
    expect(mimeFor("a.exe")).toBeNull();
  });

  it("upload in parts, retry a network failure, and tell the server when cancelled", async () => {
    jest
      .spyOn(fileReader, "readPart")
      .mockImplementation(async (_u, _o, len) => new Uint8Array(len));
    staff.start.mockResolvedValue({ uploadId: "u1", partSize: 10, partCount: 3, expiresAt: "x" });
    staff.putPart.mockRejectedValueOnce(appError("network")).mockResolvedValue(undefined);
    staff.complete.mockResolvedValue(staffFile());
    const progress: number[] = [];
    await uploadFile({
      courseId: "c1",
      lessonId: "l1",
      uri: "file://x",
      fileName: "x.pdf",
      mimeType: "application/pdf",
      size: 25,
      title: "X",
      onProgress: (p) => progress.push(p),
    });
    expect(staff.putPart).toHaveBeenCalledTimes(4);
    expect(staff.putPart.mock.calls.map((c) => [c[2], (c[3] as Uint8Array).length])).toEqual([
      [1, 10],
      [1, 10],
      [2, 10],
      [3, 5],
    ]);
    expect(progress).toEqual([0, 33, 67, 100]);
    const ac = new AbortController();
    ac.abort();
    await expect(
      uploadFile({
        courseId: "c1",
        lessonId: "l1",
        uri: "u",
        fileName: "x.pdf",
        mimeType: "application/pdf",
        size: 5,
        title: "X",
        signal: ac.signal,
      }),
    ).rejects.toThrow("Upload cancelled");
    expect(staff.cancel).toHaveBeenCalledWith("c1", "u1");
  });

  it("do not retry a refused part", async () => {
    jest.spyOn(fileReader, "readPart").mockResolvedValue(new Uint8Array(5));
    staff.start.mockResolvedValue({ uploadId: "u2", partSize: 10, partCount: 1, expiresAt: "x" });
    staff.putPart.mockRejectedValue(appError("forbidden"));
    await expect(
      uploadFile({
        courseId: "c1",
        lessonId: "l1",
        uri: "u",
        fileName: "x.pdf",
        mimeType: "application/pdf",
        size: 5,
        title: "X",
      }),
    ).rejects.toBeTruthy();
    expect(staff.putPart).toHaveBeenCalledTimes(1);
  });
});

describe("students open lesson files", () => {
  it("list files in words and open one through a fresh link", async () => {
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l1" });
    expect(await screen.findByText("PDF, 1.0 MB, view only")).toBeTruthy();
    expect(screen.getByText("PNG image, 2 KB")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download Chart notes" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Open Chart notes" }));
    await waitFor(() => expect(pub.link).toHaveBeenCalledWith("c1", "l1", "f1", false));
    expect(view).toHaveBeenCalledWith(expect.stringMatching(/\/files\/f1\?t=abc$/));
    await fireEvent.press(screen.getByRole("button", { name: "Download Worksheet" }));
    await waitFor(() => expect(pub.link).toHaveBeenLastCalledWith("c1", "l1", "f2", true));
    expect(download).toHaveBeenCalled();
  });

  it("explain a refused download and a missing file in words", async () => {
    pub.link.mockRejectedValueOnce(
      Object.assign(appError("forbidden"), { code: "DOWNLOAD_NOT_ALLOWED" }),
    );
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Download Worksheet" }));
    expect(await screen.findByText(/can be viewed but not downloaded/)).toBeTruthy();
    pub.link.mockRejectedValueOnce(appError("not_found"));
    await fireEvent.press(screen.getByRole("button", { name: "Open Chart notes" }));
    expect(await screen.findByText(/no longer available/)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("This file is no longer available.");
  });

  it("show nothing for a locked lesson and offer Retry when loading fails", async () => {
    pub.list.mockRejectedValueOnce(appError("forbidden"));
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l1" });
    await screen.findByText("Text.");
    expect(screen.queryByTestId("lesson-files")).toBeNull();
    expect(screen.queryByText("Files could not be loaded.")).toBeNull();
    await screen.unmount();
    pub.list.mockRejectedValueOnce(appError("unknown")).mockResolvedValue([file()]);
    await renderRouter(app, { initialUrl: "/course/c1/lesson/l1" });
    await fireEvent.press(await screen.findByRole("button", { name: /retry/i }));
    expect(await screen.findByText("Chart notes")).toBeTruthy();
  });
});

describe("staff manage lesson files", () => {
  beforeEach(() => {
    staffLessons.get.mockResolvedValue({
      id: "l1",
      courseId: "c1",
      moduleId: null,
      title: "Candles",
      body: "Text",
      position: 1,
      isPreview: false,
      version: 1,
      createdAt: "2026-11-17T00:00:00.000Z",
      updatedAt: "2026-11-17T00:00:00.000Z",
    });
    staff.list.mockResolvedValue([staffFile()]);
  });

  it("refuse unsupported and oversize files before uploading", async () => {
    const pick = jest.spyOn(filePicker, "pick");
    pick.mockResolvedValueOnce({ uri: "u", name: "tool.exe", size: 10 });
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/l1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Add file" }));
    expect(await screen.findByText(/not supported/)).toBeTruthy();
    pick.mockResolvedValueOnce({
      uri: "u",
      name: "big.pdf",
      size: 60 * 1024 * 1024,
      mimeType: "application/pdf",
    });
    await fireEvent.press(screen.getByRole("button", { name: "Add file" }));
    expect(await screen.findByText(/Files can be up to 50 MB/)).toBeTruthy();
    expect(staff.start).not.toHaveBeenCalled();
  });

  it("upload with progress, then offer Try again after a failure", async () => {
    jest
      .spyOn(filePicker, "pick")
      .mockResolvedValue({ uri: "u", name: "Week 1.pdf", size: 25, mimeType: "application/pdf" });
    jest
      .spyOn(fileReader, "readPart")
      .mockImplementation(async (_u, _o, len) => new Uint8Array(len));
    staff.start.mockResolvedValue({ uploadId: "u1", partSize: 10, partCount: 3, expiresAt: "x" });
    let release!: () => void;
    staff.putPart.mockImplementation(() => new Promise<void>((r) => (release = r)));
    staff.complete
      .mockRejectedValueOnce(
        appError("validation", {
          fields: [{ field: "file", message: "The file's content does not match its type." }],
        }),
      )
      .mockResolvedValue(staffFile({ id: "f9", title: "Week 1" }));
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/l1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Add file" }));
    expect(screen.getByLabelText("File title", hidden).props.value).toBe("Week 1");
    await press("Upload");
    expect(await screen.findByText("Uploading, 0 percent", hidden)).toBeTruthy();
    for (let i = 0; i < 3; i++) await act(async () => release());
    expect((await screen.findAllByText(/does not match its type/, hidden)).length).toBeGreaterThan(
      0,
    );
    expect(announce).toHaveBeenCalledWith("Upload failed");
    staff.putPart.mockResolvedValue(undefined);
    await press("Try again");
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Week 1 added"));
    expect(staff.complete).toHaveBeenLastCalledWith("c1", "u1", {
      title: "Week 1",
      downloadable: false,
    });
  });

  it("cancel an upload in progress", async () => {
    jest
      .spyOn(filePicker, "pick")
      .mockResolvedValue({ uri: "u", name: "a.pdf", size: 25, mimeType: "application/pdf" });
    jest
      .spyOn(fileReader, "readPart")
      .mockImplementation(async (_u, _o, len) => new Uint8Array(len));
    staff.start.mockResolvedValue({ uploadId: "u7", partSize: 10, partCount: 3, expiresAt: "x" });
    let release!: () => void;
    staff.putPart.mockImplementation(() => new Promise<void>((r) => (release = r)));
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/l1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Add file" }));
    await press("Upload");
    await screen.findByText("Uploading, 0 percent", hidden);
    await press("Cancel upload");
    await act(async () => release());
    await waitFor(() => expect(staff.cancel).toHaveBeenCalledWith("c1", "u7"));
    expect(announce).toHaveBeenCalledWith("Upload cancelled");
    expect(staff.complete).not.toHaveBeenCalled();
  });

  it("toggle downloads, rename, replace keeping settings, and delete", async () => {
    staff.update.mockResolvedValue(staffFile({ downloadable: true, version: 2 }));
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/l1" });
    expect(await screen.findByText("PDF, 1.0 MB, not scanned")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Students can download Chart notes: off" }),
    );
    await waitFor(() =>
      expect(staff.update).toHaveBeenCalledWith("c1", "l1", "f1", {
        expectedVersion: 1,
        downloadable: true,
      }),
    );
    expect(announce).toHaveBeenCalledWith("Students can now download Chart notes");
    await fireEvent.press(screen.getByRole("button", { name: "Rename Chart notes" }));
    await fireEvent.changeText(await screen.findByDisplayValue("Chart notes", hidden), "New title");
    await press("Save title");
    await waitFor(() =>
      expect(staff.update).toHaveBeenLastCalledWith("c1", "l1", "f1", {
        expectedVersion: 1,
        title: "New title",
      }),
    );
    jest
      .spyOn(filePicker, "pick")
      .mockResolvedValue({ uri: "u", name: "v2.pdf", size: 5, mimeType: "application/pdf" });
    jest.spyOn(fileReader, "readPart").mockResolvedValue(new Uint8Array(5));
    staff.start.mockResolvedValue({ uploadId: "u3", partSize: 10, partCount: 1, expiresAt: "x" });
    staff.putPart.mockResolvedValue(undefined);
    staff.complete.mockResolvedValue(staffFile({ version: 3 }));
    await fireEvent.press(screen.getByRole("button", { name: "Replace Chart notes" }));
    await press("Upload new file");
    await waitFor(() =>
      expect(staff.complete).toHaveBeenCalledWith("c1", "u3", {
        title: "Chart notes",
        replaceResourceId: "f1",
      }),
    );
    await waitFor(() => expect(announce).toHaveBeenCalledWith("File replaced"));
    await fireEvent.press(screen.getByRole("button", { name: "Delete Chart notes" }));
    await press("Delete file");
    await waitFor(() => expect(staff.remove).toHaveBeenCalledWith("c1", "l1", "f1"));
  });

  it("explain a permission refusal when loading files", async () => {
    staff.list.mockRejectedValue(appError("forbidden"));
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/l1" });
    expect(await screen.findByText("Edit lesson")).toBeTruthy();
    expect(
      await screen.findByText(/do not have permission to manage this lesson's files/),
    ).toBeTruthy();
  });
});
