import { fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions } from "react-native";
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

describe("destination layout by width", () => {
  afterEach(() => jest.restoreAllMocks());
  const at = (width: number, fontScale = 1) =>
    jest.spyOn(Dimensions, "get").mockReturnValue({ width, height: 800, scale: 2, fontScale });
  const rowsOf = () => {
    const parents = DESTINATIONS.map((d) => screen.getByTestId(`city-${d.key}`).parent);
    const rows: unknown[] = [];
    for (const p of parents) if (!rows.includes(p)) rows.push(p);
    return rows.length;
  };

  it.each([320, 360, 390, 430])("uses two columns and two rows at %idp", async (w) => {
    at(w);
    await render(<MarketCity />);
    expect(rowsOf()).toBe(2);
    // The complete name is rendered, never split.
    for (const d of DESTINATIONS) expect(screen.getByText(d.label)).toBeTruthy();
  });

  it("keeps two columns on a phone with very large text", async () => {
    at(360, 1.6);
    await render(<MarketCity />);
    expect(rowsOf()).toBe(2);
  });

  it.each([600, 768, 1024])("uses one row of four on a %idp tablet", async (w) => {
    at(w);
    await render(<MarketCity />);
    expect(rowsOf()).toBe(1);
  });

  it("never stretches the hero: it is cropped to a fixed frame", async () => {
    at(390);
    await render(<MarketCity />);
    const hero = screen.getByTestId("city-hero-art");
    expect(hero.props.resizeMode ?? hero.props.style).toBeTruthy();
    expect(hero.props.resizeMode).toBe("cover");
  });
});
