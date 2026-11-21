import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import { LearningJourney } from "../src/progress/LearningJourney";
import { lessonApi } from "../src/lessons/lesson-api";
import { progressApi } from "../src/progress/progress-api";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../src/progress/progress-api", () => ({ progressApi: { read: jest.fn() } }));
jest.mock("../src/lessons/lesson-api", () => ({ lessonApi: { outline: jest.fn() } }));

it("shows one unit card per module, in order, with real completed counts", async () => {
  jest.mocked(progressApi.read).mockResolvedValue({
    completed: 1,
    total: 3,
    nextLessonId: "l2",
    lessons: [{ lessonId: "l1", completedAt: "2026-11-20" }],
  });
  jest.mocked(lessonApi.outline).mockResolvedValue({
    modules: [
      { id: "m1", title: "How Markets Work", position: 1 },
      { id: "m2", title: "Where Trades Happen", position: 2 },
      { id: "m3", title: "Buying and Selling", position: 3 },
    ],
    items: [
      { id: "l1", title: "A", position: 1, moduleId: "m1", isPreview: false },
      { id: "l2", title: "B", position: 1, moduleId: "m2", isPreview: false },
      { id: "l3", title: "C", position: 1, moduleId: "m3", isPreview: false },
    ],
  } as Awaited<ReturnType<typeof lessonApi.outline>>);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <LearningJourney courseId="c1" />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("UNIT 1")).toBeTruthy();
  expect(screen.getByText("UNIT 2")).toBeTruthy();
  expect(screen.getByText("UNIT 3")).toBeTruthy();
  expect(screen.getByText("Module 1: How Markets Work")).toBeTruthy();
  expect(screen.getByText("1 of 1 completed")).toBeTruthy();
  expect(screen.getAllByText("0 of 1 completed")).toHaveLength(2);
});
