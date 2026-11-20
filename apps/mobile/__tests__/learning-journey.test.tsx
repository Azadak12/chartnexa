import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ResumeLearning } from "../src/progress/ResumeLearning";
import { CourseLearningAction } from "../src/progress/CourseLearningAction";
import { LessonCompletionPanel } from "../src/progress/LessonCompletionPanel";
import { continueApi } from "../src/progress/continue-api";
import { lessonApi } from "../src/lessons/lesson-api";
import { progressApi } from "../src/progress/progress-api";
import { courseApi } from "../src/courses/course-api";

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, navigate: mockPush }),
}));
jest.mock("../src/progress/continue-api", () => ({ continueApi: { get: jest.fn() } }));
jest.mock("../src/progress/progress-api", () => ({ progressApi: { read: jest.fn() } }));
jest.mock("../src/lessons/lesson-api", () => ({ lessonApi: { outline: jest.fn() } }));
jest.mock("../src/courses/course-api", () => ({ courseApi: { get: jest.fn() } }));
const resume = {
  courseId: "c1",
  courseTitle: "Price action",
  nextLessonId: "l2",
  nextLessonTitle: "Find support",
  completed: 1,
  total: 2,
  coverTone: "blue",
  thumbnailUrl: null,
  lastActivityAt: "2026-11-20",
};
const progress = {
  completed: 1,
  total: 2,
  nextLessonId: "l2",
  lessons: [{ lessonId: "l1", completedAt: "2026-11-20" }],
};
async function mount(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(continueApi.get).mockResolvedValue(resume);
  jest.mocked(progressApi.read).mockResolvedValue(progress);
  jest.mocked(lessonApi.outline).mockResolvedValue({
    modules: [{ id: "m1", title: "Foundations", position: 1 }],
    items: [
      { id: "l1", title: "Read candles", position: 1, moduleId: "m1", isPreview: true },
      { id: "l2", title: "Find support", position: 2, moduleId: "m1", isPreview: false },
    ],
  } as Awaited<ReturnType<typeof lessonApi.outline>>);
});
it("loads the path only on expansion and opens a lesson with truthful statuses", async () => {
  await mount(<ResumeLearning journey />);
  const toggle = await screen.findByRole("button", { name: "Your learning path" });
  expect(lessonApi.outline).not.toHaveBeenCalled();
  await fireEvent.press(toggle);
  expect(await screen.findByRole("button", { name: "Read candles, Completed" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Find support, Up next" }));
  expect(mockPush).toHaveBeenCalledWith("/course/c1/lesson/l2");
  await fireEvent.press(toggle);
  expect(screen.queryByTestId("learning-journey")).toBeNull();
});
it("offers retry for a failed path instead of showing every lesson as unfinished", async () => {
  jest.mocked(progressApi.read).mockRejectedValueOnce(new Error("failed"));
  await mount(<ResumeLearning journey />);
  await fireEvent.press(await screen.findByRole("button", { name: "Your learning path" }));
  await fireEvent.press(await screen.findByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("button", { name: "Read candles, Completed" })).toBeTruthy();
});
it("distinguishes empty resume from failure and retries", async () => {
  jest.mocked(continueApi.get).mockRejectedValueOnce(new Error("failed"));
  await mount(<ResumeLearning />);
  await fireEvent.press(await screen.findByRole("button", { name: "Retry continue learning" }));
  expect(await screen.findByTestId("continue-learning")).toBeTruthy();
});
it("offers discovery when there is no resume course", async () => {
  jest.mocked(continueApi.get).mockResolvedValue(null);
  await mount(<ResumeLearning />);
  await fireEvent.press(await screen.findByRole("button", { name: "Explore courses" }));
  expect(mockPush).toHaveBeenCalledWith("/explore");
});
it("resolves a course's next lesson on Continue", async () => {
  jest
    .mocked(courseApi.get)
    .mockResolvedValue({ enrolled: true, nextLessonId: "l2" } as Awaited<
      ReturnType<typeof courseApi.get>
    >);
  await mount(<CourseLearningAction courseId="c1" completed={1} total={2} />);
  expect(courseApi.get).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/course/c1/lesson/l2"));
});
it("refuses direct learning when access has ended", async () => {
  jest
    .mocked(courseApi.get)
    .mockResolvedValue({ enrolled: false, nextLessonId: "l2" } as Awaited<
      ReturnType<typeof courseApi.get>
    >);
  await mount(<CourseLearningAction courseId="c1" completed={0} total={2} />);
  await fireEvent.press(screen.getByRole("button", { name: "Start" }));
  expect(await screen.findByText(/You no longer have access to this course/)).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});
it("allows retry after a failed direct action", async () => {
  jest
    .mocked(courseApi.get)
    .mockRejectedValueOnce(new Error("failed"))
    .mockResolvedValue({ enrolled: true, nextLessonId: "l2" } as Awaited<
      ReturnType<typeof courseApi.get>
    >);
  await mount(<CourseLearningAction courseId="c1" completed={0} total={2} />);
  await fireEvent.press(screen.getByRole("button", { name: "Start" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Start" })).toBeEnabled());
  await fireEvent.press(screen.getByRole("button", { name: "Start" }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/course/c1/lesson/l2"));
});
it("has no lesson action for an empty course", async () => {
  await mount(<CourseLearningAction courseId="c1" completed={0} total={0} />);
  expect(screen.queryByRole("button")).toBeNull();
});
it("uses confirmed IDs rather than a stale nextLessonId after marking", async () => {
  await mount(
    <LessonCompletionPanel
      courseId="c1"
      lessonId="l1"
      progress={{ ...progress, nextLessonId: "l1" }}
    />,
  );
  await fireEvent.press(await screen.findByRole("button", { name: "Continue to next lesson" }));
  expect(mockReplace).toHaveBeenCalledWith("/course/c1/lesson/l2");
});
it("shows a course milestone without a next action when all lessons are done", async () => {
  jest.mocked(lessonApi.outline).mockImplementation(() => new Promise(() => {}));
  await mount(
    <LessonCompletionPanel
      courseId="c1"
      lessonId="l2"
      progress={{
        completed: 2,
        total: 2,
        nextLessonId: null,
        lessons: [...progress.lessons, { lessonId: "l2", completedAt: "2026-11-20" }],
      }}
    />,
  );
  expect(screen.getByText("Course complete. Well done!")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Continue to next lesson" })).toBeNull();
});
