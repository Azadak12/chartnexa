import { fireEvent, render, screen } from "@testing-library/react-native";
import { Button } from "../src/ui";

const mockImpact = jest.fn(async () => undefined);
const mockNotify = jest.fn(async () => undefined);
jest.mock("expo-haptics", () => ({
  impactAsync: (...a: unknown[]) => mockImpact(...(a as [])),
  notificationAsync: (...a: unknown[]) => mockNotify(...(a as [])),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Success: "success" },
}));

describe("Button", () => {
  beforeEach(() => jest.clearAllMocks());

  it("still calls onPress and gives a firmer tap for the main action", async () => {
    const onPress = jest.fn();
    await render(<Button label="Go" onPress={onPress} />);
    await fireEvent.press(screen.getByRole("button", { name: "Go" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockImpact).toHaveBeenCalledWith("medium");
  });

  it("gives a soft tap for secondary buttons", async () => {
    await render(<Button label="More" variant="secondary" onPress={() => {}} />);
    await fireEvent.press(screen.getByRole("button", { name: "More" }));
    expect(mockImpact).toHaveBeenCalledWith("light");
  });

  it("does nothing, and gives no tap, while loading or disabled", async () => {
    const onPress = jest.fn();
    await render(<Button label="Busy" loading onPress={onPress} />);
    await fireEvent.press(screen.getByRole("button", { name: "Busy" }));
    expect(onPress).not.toHaveBeenCalled();
    expect(mockImpact).not.toHaveBeenCalled();
  });
});
