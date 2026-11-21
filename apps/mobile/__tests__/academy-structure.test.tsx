import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Dimensions } from "react-native";
import type { MyCourse } from "@chartnexa/api-contracts";
import { CourseHero } from "../src/progress/CourseHero";
import { CourseStrip } from "../src/progress/CourseStrip";

const mk = (id: string, title: string, completed: number, total: number): MyCourse => ({
  id,
  title,
  summary: `About ${title}`,
  level: "beginner",
  priceCents: 0,
  currency: "USD",
  coverTone: "blue",
  thumbnailUrl: null,
  onSale: true,
  enrolledAt: "2026-01-01T00:00:00Z",
  progress: { completed, total },
});
const courses = [mk("a", "Market Basics", 3, 12), mk("b", "Candle Charts", 0, 8)];

function Harness() {
  const [id, setId] = useState("a");
  const selected = courses.find((c) => c.id === id)!;
  return (
    <>
      <CourseStrip courses={courses} selectedId={id} onSelect={(c) => setId(c.id)} />
      <CourseHero course={selected} onOpen={() => {}} />
    </>
  );
}

describe("the course strip and hero", () => {
  it("pressing a strip card changes the hero, using real counts only", async () => {
    await render(<Harness />);
    expect(screen.getByTestId("course-hero-count")).toHaveTextContent("3/12 lessons");
    await fireEvent.press(screen.getByTestId("strip-b"));
    expect(screen.getByTestId("course-hero-count")).toHaveTextContent("0/8 lessons");
    expect(screen.getByText("About Candle Charts")).toBeTruthy();
  });

  it("shows no mastery score, rank or percentage the backend does not store", async () => {
    await render(<Harness />);
    expect(screen.queryByText(/mastered|strong|rank|xp|streak/i)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("gives each strip card a spoken name with its real progress", async () => {
    await render(<Harness />);
    expect(screen.getByLabelText("Market Basics, 3 of 12 lessons done")).toBeTruthy();
    expect(screen.getByLabelText("Candle Charts, 0 of 8 lessons done")).toBeTruthy();
  });

  it("renders nothing for an empty list without crashing", async () => {
    await render(<CourseStrip courses={[]} onSelect={() => {}} />);
    expect(screen.queryByTestId(/^strip-/)).toBeNull();
  });

  it.each([320, 360, 390, 430])("renders at %ipx and 200 percent text", async (w) => {
    jest
      .spyOn(Dimensions, "get")
      .mockReturnValue({ width: w, height: 800, scale: 2, fontScale: 2 });
    await render(<Harness />);
    expect(screen.getByRole("header", { name: "Market Basics" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open course" })).toBeTruthy();
  });
});
