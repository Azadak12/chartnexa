import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import * as SecureStore from "expo-secure-store";
import { courseApi, fetchAccess } from "../src/courses/course-api";
import { lessonApi, staffLessonApi } from "../src/lessons/lesson-api";
import { progressApi } from "../src/progress/progress-api";
import { fileReader } from "../src/resources/upload";
import { staffResourceApi } from "../src/resources/resource-api";
import { clock, minutesText, staffVideoApi, videoApi } from "../src/video/video-api";
import { videoPicker } from "../src/video/StaffLessonVideo";
import { sessionManager } from "../src/auth/session-manager";
import { sessionStore } from "../src/session/session-store";
import { clearScreenMemory } from "../src/navigation/screen-memory";
import { appError, pair } from "../test-utils/auth-mocks";
import { mockBackHandler } from "../test-utils/back-handler";

type PlayerProps = {
  url: string;
  startAt: number;
  rate: number;
  onTick: (s: number, playing: boolean) => void;
  onStatus: (s: "loading" | "ready" | "error") => void;
};
const player: { props: PlayerProps | null; mounts: number } = { props: null, mounts: 0 };
jest.mock("../src/video/NativePlayer", () => {
  const React = jest.requireActual("react");
  return {
    NativePlayer: (props: PlayerProps) => {
      React.useEffect(() => {
        player.mounts += 1;
      }, []);
      player.props = props;
      return null;
    },
  };
});
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
  resourceApi: { list: jest.fn(async () => []), link: jest.fn() },
  staffResourceApi: {
    list: jest.fn(async () => []),
    putPart: jest.fn(),
    cancel: jest.fn(async () => undefined),
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

// Spies on the real objects, so the real upload helper calls them too.
let vapi: Record<"get" | "report", jest.SpyInstance>;
let sapi: Record<"get" | "start" | "complete" | "remove", jest.SpyInstance>;
const parts = staffResourceApi as unknown as Record<"putPart" | "cancel", jest.Mock>;
const lessons = lessonApi as unknown as { get: jest.Mock };
const staffLessons = staffLessonApi as unknown as { get: jest.Mock };
const courses = courseApi as unknown as { get: jest.Mock };
const progress = progressApi as unknown as { read: jest.Mock };
const access = fetchAccess as unknown as jest.Mock;
const secure = SecureStore as unknown as { __reset: () => void };
mockBackHandler();
const app = "./app";
const hidden = { includeHiddenElements: true };
const url = "/course/c1/lesson/l1";
const video = (over: Record<string, unknown> = {}) => ({
  durationSeconds: 600,
  playback: { url: "/videos/v1/stream?t=tok", expiresAt: "2026-11-19T04:00:00.000Z" },
  progress: { positionSeconds: 240, watchedSeconds: 240, completed: false, requiredSeconds: 540 },
  ...over,
});
const press = (name: string) =>
  fireEvent.press(screen.getAllByRole("button", { name, ...hidden }).at(-1)!);
/** Plays `seconds` of video from `from`, one tick per second. */
const play = async (from: number, seconds: number) => {
  for (let i = 1; i <= seconds; i++) await act(async () => player.props!.onTick(from + i, true));
};

let announce: jest.SpyInstance;
beforeEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  player.props = null;
  player.mounts = 0;
  secure.__reset();
  clearScreenMemory();
  sessionManager._resetForTests();
  sessionStore.set("signed-out");
  await sessionManager.signIn(pair());
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  vapi = { get: jest.spyOn(videoApi, "get"), report: jest.spyOn(videoApi, "report") };
  sapi = {
    get: jest.spyOn(staffVideoApi, "get").mockResolvedValue(null),
    start: jest.spyOn(staffVideoApi, "start"),
    complete: jest.spyOn(staffVideoApi, "complete"),
    remove: jest.spyOn(staffVideoApi, "remove").mockResolvedValue(undefined),
  };
  access.mockResolvedValue({
    roles: ["student", "manager"],
    permissions: ["lesson:upload", "course:update"],
    courseGrants: [],
  });
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
    previewCount: 0,
    enrolled: true,
  });
  progress.read.mockResolvedValue({ completed: 0, total: 1, nextLessonId: "l1", lessons: [] });
  lessons.get.mockResolvedValue({
    id: "l1",
    title: "Candles",
    position: 1,
    isPreview: false,
    body: "Some text.",
  });
  vapi.get.mockResolvedValue(video());
  vapi.report.mockImplementation(async (_c, _l, pos: number, delta: number) => ({
    positionSeconds: pos,
    watchedSeconds: 240 + delta,
    completed: false,
    requiredSeconds: 540,
  }));
});

describe("helpers", () => {
  it("format times and lengths in words", () => {
    expect(clock(65)).toBe("1:05");
    expect(clock(3909)).toBe("1:05:09");
    expect(minutesText(30)).toBe("1 minute");
    expect(minutesText(600)).toBe("10 minutes");
  });
});

describe("watching a lesson video", () => {
  it("shows the length, resumes where the owner stopped, and offers speeds", async () => {
    await renderRouter(app, { initialUrl: url });
    expect(await screen.findByText("Video, 10 minutes")).toBeTruthy();
    expect(screen.getByText("Continues from 4:00")).toBeTruthy();
    await waitFor(() => expect(player.props).not.toBeNull());
    expect(player.props!.url).toMatch(/\/videos\/v1\/stream\?t=tok$/);
    expect(player.props!.startAt).toBe(240);
    await fireEvent.press(screen.getByRole("button", { name: "1.5x" }));
    expect(player.props!.rate).toBe(1.5);
    expect(
      screen.getByText("Watched 40 percent. The lesson completes at 90 percent."),
    ).toBeTruthy();
    // Manual marking is for text lessons; a video lesson completes by watching.
    expect(screen.queryByRole("button", { name: /mark.*complete/i })).toBeNull();
  });

  it("reports played time every 15 seconds and ignores seeks", async () => {
    await renderRouter(app, { initialUrl: url });
    await waitFor(() => expect(player.props).not.toBeNull());
    await act(async () => player.props!.onTick(240, true));
    await act(async () => player.props!.onTick(400, true)); // a seek forward
    await play(400, 15);
    await waitFor(() => expect(vapi.report).toHaveBeenCalledTimes(1));
    expect(vapi.report).toHaveBeenCalledWith("c1", "l1", 415, 15);
  });

  it("keeps unreported time after a failed report and sends it next time", async () => {
    vapi.report.mockRejectedValueOnce(appError("network"));
    await renderRouter(app, { initialUrl: url });
    await waitFor(() => expect(player.props).not.toBeNull());
    await act(async () => player.props!.onTick(0, true));
    await play(0, 15);
    await play(15, 15);
    await waitFor(() => expect(vapi.report).toHaveBeenCalledTimes(2));
    expect(vapi.report.mock.calls[1]).toEqual(["c1", "l1", 30, 30]);
  });

  it("announces completion when the server says the lesson is complete", async () => {
    vapi.report.mockResolvedValueOnce({
      positionSeconds: 560,
      watchedSeconds: 545,
      completed: true,
      requiredSeconds: 540,
    });
    await renderRouter(app, { initialUrl: url });
    await waitFor(() => expect(player.props).not.toBeNull());
    await act(async () => player.props!.onTick(540, true));
    await play(540, 15);
    expect(await screen.findByText("✓ Completed")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Lesson complete");
  });

  it("sends no reports for a free-preview viewer who does not own the course", async () => {
    vapi.get.mockResolvedValue(video({ progress: null }));
    await renderRouter(app, { initialUrl: url });
    await waitFor(() => expect(player.props).not.toBeNull());
    await act(async () => player.props!.onTick(0, true));
    await play(0, 20);
    expect(vapi.report).not.toHaveBeenCalled();
    expect(player.props!.startAt).toBe(0);
  });

  it("explains a playback failure and starts the player again with a fresh link", async () => {
    await renderRouter(app, { initialUrl: url });
    await waitFor(() => expect(player.props).not.toBeNull());
    await act(async () => player.props!.onStatus("error"));
    expect(await screen.findByText(/The video stopped/)).toBeTruthy();
    const before = player.mounts;
    await fireEvent.press(screen.getByRole("button", { name: "Try video again" }));
    await waitFor(() => expect(player.mounts).toBeGreaterThan(before));
    expect(vapi.get.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("offers Retry when the video cannot be loaded, and shows nothing for a text lesson", async () => {
    vapi.get.mockRejectedValue(appError("unknown"));
    await renderRouter(app, { initialUrl: url });
    const retry = await screen.findByRole("button", { name: "Retry video" });
    vapi.get.mockResolvedValue(video());
    await fireEvent.press(retry);
    expect(await screen.findByText("Video, 10 minutes")).toBeTruthy();
    await screen.unmount();
    vapi.get.mockResolvedValue(null);
    await renderRouter(app, { initialUrl: url });
    await screen.findByText("Some text.");
    expect(screen.queryByTestId("lesson-video")).toBeNull();
  });
});

describe("staff manage a lesson video", () => {
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
    sapi.get.mockResolvedValue(null);
    jest
      .spyOn(fileReader, "readPart")
      .mockImplementation(async (_u, _o, len) => new Uint8Array(len));
    parts.putPart.mockResolvedValue(undefined);
  });
  const ready = {
    id: "v1",
    lessonId: "l1",
    status: "ready",
    provider: "test",
    durationSeconds: 600,
    sizeBytes: 25,
    errorCode: null,
    version: 1,
    updatedAt: "x",
  };

  it("refuses non-MP4 and oversize videos before uploading", async () => {
    const pick = jest.spyOn(videoPicker, "pick");
    pick.mockResolvedValueOnce({ uri: "u", name: "clip.mov", size: 10 });
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/l1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Add video" }));
    expect(await screen.findByText(/Use an MP4 video/)).toBeTruthy();
    pick.mockResolvedValueOnce({ uri: "u", name: "big.mp4", size: 2 * 1024 * 1024 * 1024 });
    await fireEvent.press(screen.getByRole("button", { name: "Add video" }));
    expect(await screen.findByText(/Videos can be up to 1 GB/)).toBeTruthy();
    expect(sapi.start).not.toHaveBeenCalled();
  });

  it("uploads with progress, then shows the ready video", async () => {
    jest.spyOn(videoPicker, "pick").mockResolvedValue({ uri: "u", name: "lesson.mp4", size: 25 });
    sapi.start.mockResolvedValue({ uploadId: "up1", partSize: 10, partCount: 3, expiresAt: "x" });
    let release!: () => void;
    parts.putPart.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    sapi.complete.mockResolvedValue(ready);
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/l1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Add video" }));
    expect(await screen.findByText("Uploading video, 0 percent")).toBeTruthy();
    sapi.get.mockResolvedValue(ready);
    await act(async () => release());
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Video added"));
    expect(await screen.findByText(/Ready, 10 minutes/)).toBeTruthy();
    expect(sapi.complete).toHaveBeenCalledWith("c1", "up1");
  });

  it("offers to retry the same file after a failure, and can cancel", async () => {
    jest.spyOn(videoPicker, "pick").mockResolvedValue({ uri: "u", name: "lesson.mp4", size: 5 });
    sapi.start.mockResolvedValue({ uploadId: "up2", partSize: 10, partCount: 1, expiresAt: "x" });
    sapi.complete
      .mockRejectedValueOnce(
        appError("validation", {
          fields: [{ field: "file", message: "This file is not an MP4 video." }],
        }),
      )
      .mockResolvedValue(ready);
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/l1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Add video" }));
    expect(await screen.findByText(/not an MP4 video/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Try the video upload again" }));
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Video added"));
    expect(sapi.start).toHaveBeenCalledTimes(2);
  });

  it("cancels an upload in progress", async () => {
    jest.spyOn(videoPicker, "pick").mockResolvedValue({ uri: "u", name: "lesson.mp4", size: 25 });
    sapi.start.mockResolvedValue({ uploadId: "up3", partSize: 10, partCount: 3, expiresAt: "x" });
    let release!: () => void;
    parts.putPart.mockImplementation(() => new Promise<void>((r) => (release = r)));
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/l1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Add video" }));
    await screen.findByText("Uploading video, 0 percent");
    await fireEvent.press(screen.getByRole("button", { name: "Cancel video upload" }));
    await act(async () => release());
    await waitFor(() => expect(parts.cancel).toHaveBeenCalledWith("c1", "up3"));
    expect(announce).toHaveBeenCalledWith("Upload cancelled");
  });

  it("removes a video after confirming", async () => {
    sapi.get.mockResolvedValue(ready);
    await renderRouter(app, { initialUrl: "/manage/c1/lessons/l1" });
    await fireEvent.press(await screen.findByRole("button", { name: "Remove video" }));
    expect(screen.getByText(/Lessons they completed stay complete/, hidden)).toBeTruthy();
    await press("Remove video");
    await waitFor(() => expect(sapi.remove).toHaveBeenCalledWith("c1", "l1"));
    expect(announce).toHaveBeenCalledWith("Video removed");
  });
});
