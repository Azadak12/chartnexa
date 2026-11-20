import { fireEvent, render, screen } from "@testing-library/react-native";
import { AssignmentCard } from "../src/kit/AssignmentCard";
import { LiveSessionRow } from "../src/live/LiveSessionRow";
import { StatusPill } from "../src/ui";
import { contrastRatio } from "@chartnexa/design-tokens";
import { colors, status } from "../src/theme";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

const session = {
  id: "s1",
  courseId: "c1",
  courseTitle: "Price action",
  title: "Weekly review",
  description: null,
  startsAt: "2026-12-01T09:30:00.000Z",
  joinOpensAt: "2026-12-01T09:20:00.000Z",
  durationMinutes: 60,
  state: "live",
  cancelReason: null,
} as unknown as Parameters<typeof LiveSessionRow>[0]["session"];

it("shows a state as words with an icon, not colour alone", async () => {
  await render(<StatusPill label="Submitted" tone="success" icon="check-circle" />);
  expect(screen.getByText("Submitted")).toBeTruthy();
});

it("keeps the full assignment sentence and press behaviour in the mission card", async () => {
  const onPress = jest.fn();
  await render(
    <AssignmentCard
      title="Chart review"
      courseTitle="Price action"
      stateText="Not submitted"
      stateTone="link"
      dueText="Due Friday"
      overdue
      onPress={onPress}
    />,
  );
  const card = screen.getByRole("button", {
    name: "Chart review, Price action, Not submitted, overdue. Due Friday",
  });
  await fireEvent.press(card);
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Overdue · Due Friday")).toBeTruthy();
});

it("offers Join on a live class and says it is live in words", async () => {
  const onJoin = jest.fn();
  await render(<LiveSessionRow session={session} showCourse joining={false} onJoin={onJoin} />);
  expect(screen.getByText("Live now")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Join Weekly review" }));
  expect(onJoin).toHaveBeenCalledTimes(1);
});

it("keeps status colours readable on the card surface", () => {
  for (const c of [status.error, status.success, status.warning]) {
    expect(contrastRatio(c, colors.surface)).toBeGreaterThanOrEqual(4.5);
  }
});
