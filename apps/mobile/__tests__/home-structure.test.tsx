import { render, screen } from "@testing-library/react-native";
import { AppHeader } from "../src/kit/AppHeader";
import { DESTINATIONS } from "../src/city/city-assets";

describe("Home structure", () => {
  it("shows the brand lockup with the academy tagline and keeps the greeting", async () => {
    await render(<AppHeader greeting="Good morning, Sam" onBell={() => {}} />);
    expect(screen.getByTestId("header-tagline")).toHaveTextContent("PERSONAL TRADING ACADEMY");
    expect(screen.getByTestId("header-greeting")).toHaveTextContent("Good morning, Sam");
  });

  it("gives every destination an icon, so tiles are controls rather than bare labels", () => {
    for (const d of DESTINATIONS) expect(d.icon).toBeTruthy();
    expect(DESTINATIONS.map((d) => d.label)).toEqual(["Academy", "Library", "Lab", "Missions"]);
  });
});
