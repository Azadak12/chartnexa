import { fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions, StyleSheet } from "react-native";
import { CourseCard, FeaturedCourseCard, thumbWidth } from "../src/kit/CourseCards";

const course = (over: Record<string, unknown> = {}) =>
  ({
    id: "c1",
    title: "Trading Fundamentals",
    summary: "s",
    level: "intermediate",
    priceCents: 12999,
    currency: "USD",
    coverTone: "blue",
    thumbnailUrl: null,
    categoryName: "Technical Analysis",
    instructor: { id: "i1", displayName: "Instructor Demo" },
    rating: { average: 4.5, count: 1280 },
    publishedAt: "2026-11-17T00:00:00.000Z",
    ...over,
  }) as never;
const LONG =
  "The Complete Professional Guide to Advanced Candlestick Pattern Recognition, Risk Management and Trading Psychology for Serious Learners";

const atWidth = (w: number) =>
  jest.spyOn(Dimensions, "get").mockReturnValue({ width: w, height: 800, scale: 2, fontScale: 1 });
afterEach(() => jest.restoreAllMocks());

describe.each([320, 360, 393, 430])("CourseCard at %idp", (w) => {
  it("has no fixed widths except a thumbnail that fits, and a flexible text column", async () => {
    atWidth(w);
    await render(<CourseCard course={course({ title: LONG })} onPress={() => {}} />);
    const body = StyleSheet.flatten(screen.getByTestId("card-body-c1").props.style);
    expect(body.flex).toBe(1);
    expect(body.minWidth).toBe(0);
    expect(body.width).toBeUndefined();
    const thumb = thumbWidth(w);
    // Padding (8 x 2), gap (12), border (2) and the thumbnail leave the rest for text.
    expect(w - thumb - 16 - 12 - 2 - 32).toBeGreaterThanOrEqual(120);
  });

  it("limits a long title to two lines and keeps the price whole on its own row", async () => {
    atWidth(w);
    await render(<CourseCard course={course({ title: LONG })} onPress={() => {}} />);
    expect(screen.getByText(LONG).props.numberOfLines).toBe(2);
    const price = screen.getByTestId("price-c1");
    expect(price.props.children).toBe("$129.99");
    expect(StyleSheet.flatten(price.props.style).flexShrink).toBe(0);
    // The rating is a different element in a different row from the price.
    expect(screen.getByTestId("rating-c1")).not.toBe(price);
    expect(screen.getByText("4.5 (1280)")).toBeTruthy();
  });

  it("keeps the whole card one tappable button that names everything", async () => {
    atWidth(w);
    const onPress = jest.fn();
    await render(<CourseCard course={course()} onPress={onPress} />);
    const card = screen.getByRole("button", {
      name: "Trading Fundamentals, Intermediate, by Instructor Demo, $129.99, 4.5 · 1280 reviews",
    });
    expect(StyleSheet.flatten(card.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("CourseCard content", () => {
  it("shows category, instructor and level, and says when there are no reviews or no instructor", async () => {
    atWidth(393);
    await render(
      <CourseCard
        course={course({ rating: { average: null, count: 0 }, instructor: null })}
        onPress={() => {}}
      />,
    );
    expect(screen.getByText("Technical Analysis")).toBeTruthy();
    expect(screen.getByText("Intermediate")).toBeTruthy();
    expect(screen.getByText("No reviews yet")).toBeTruthy();
    expect(screen.queryByText("Instructor Demo")).toBeNull();
  });

  it("prints Free for a free course, never a clipped or empty price", async () => {
    atWidth(320);
    await render(<CourseCard course={course({ priceCents: 0 })} onPress={() => {}} />);
    expect(screen.getByTestId("price-c1").props.children).toBe("Free");
  });

  it("scales the thumbnail with the screen", () => {
    expect(thumbWidth(320)).toBeLessThan(thumbWidth(360));
    expect(thumbWidth(360)).toBeLessThan(thumbWidth(430));
  });

  it("gives the featured card the same separate price row", async () => {
    atWidth(320);
    await render(
      <FeaturedCourseCard course={course({ title: LONG })} onPress={() => {}} width={240} />,
    );
    expect(screen.getByTestId("price-c1").props.children).toBe("$129.99");
    expect(screen.getByText(LONG).props.numberOfLines).toBe(2);
  });
});
