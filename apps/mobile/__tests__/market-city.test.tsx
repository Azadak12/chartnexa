import { fireEvent, render, screen } from "@testing-library/react-native";
import { MarketCity } from "../src/city/MarketCity";
import { CITY_ART_COMPLETE, DESTINATIONS } from "../src/city/city-assets";
import { layoutFor } from "../src/layout/responsive";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

describe("layoutFor", () => {
  it("keeps phones full-width and centres capped content on tablets", () => {
    expect(layoutFor(320)).toMatchObject({
      isTablet: false,
      gutter: 16,
      columns: 1,
      contentMaxWidth: 320,
    });
    expect(layoutFor(390)).toMatchObject({ gutter: 20, columns: 1 });
    expect(layoutFor(768)).toMatchObject({ isTablet: true, columns: 2, contentMaxWidth: 720 });
    expect(layoutFor(1024)).toMatchObject({ columns: 3, contentMaxWidth: 840 });
  });
});

describe("MarketCity", () => {
  beforeEach(() => mockPush.mockClear());
  it("offers every destination as a named button that opens its existing screen", async () => {
    await render(<MarketCity />);
    for (const d of DESTINATIONS) {
      await fireEvent.press(screen.getByRole("button", { name: d.spoken }));
      expect(mockPush).toHaveBeenLastCalledWith(d.route);
    }
    expect(mockPush).toHaveBeenCalledTimes(DESTINATIONS.length);
  });
  it("labels the hero as illustration and keeps the layered art flagged incomplete", async () => {
    await render(<MarketCity />);
    expect(CITY_ART_COMPLETE).toBe(false);
    expect(screen.getByTestId("city-art-notice")).toBeTruthy();
  });
});
