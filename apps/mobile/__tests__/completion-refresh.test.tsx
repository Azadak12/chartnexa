import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { CompletionControl } from "../src/progress/CompletionControl";
import { progressApi } from "../src/progress/progress-api";

jest.mock("../src/progress/progress-api", () => ({
  progressApi: { read: jest.fn(), mark: jest.fn(), unmark: jest.fn() },
}));

describe("finishing a lesson refreshes every percentage that shows it", () => {
  it("refreshes the course page, My Learning and the Home Continue Learning card", async () => {
    (progressApi.mark as jest.Mock).mockResolvedValue({
      completed: true,
      completedAt: "2026-11-19T10:00:00.000Z",
    });
    const client = new QueryClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    await render(
      <QueryClientProvider client={client}>
        <CompletionControl courseId="c1" lessonId="l1" completed={false} />
      </QueryClientProvider>,
    );
    await fireEvent.press(screen.getByRole("button", { name: /complete/i }));
    await waitFor(() => expect(progressApi.mark).toHaveBeenCalledWith("c1", "l1"));
    const keys = () =>
      spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    await waitFor(() => {
      expect(keys()).toEqual(
        expect.arrayContaining([
          '["progress","c1"]',
          '["course","c1"]',
          '["my-courses"]',
          '["continue-learning"]',
        ]),
      );
    });
  });
});
