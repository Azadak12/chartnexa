import { clampStep, splitLessonText } from "../src/lessons/steps";

describe("splitLessonText", () => {
  it("returns no steps for empty or blank text", () => {
    expect(splitLessonText("")).toEqual([]);
    expect(splitLessonText("   \n\n \t \n")).toEqual([]);
  });

  it("keeps one paragraph as one step, with its single line breaks", () => {
    expect(splitLessonText("One line.")).toEqual(["One line."]);
    expect(splitLessonText("Line one\nLine two\nLine three")).toEqual([
      "Line one\nLine two\nLine three",
    ]);
  });

  it("splits at blank lines", () => {
    expect(splitLessonText("First.\n\nSecond.\n\nThird.")).toEqual(["First.", "Second.", "Third."]);
  });

  it("treats lines with only spaces or tabs as blank", () => {
    expect(splitLessonText("First.\n   \nSecond.\n\t\nThird.")).toEqual([
      "First.",
      "Second.",
      "Third.",
    ]);
  });

  it("handles Windows and old Mac line endings", () => {
    expect(splitLessonText("A\r\n\r\nB\r\n\r\nC")).toEqual(["A", "B", "C"]);
    expect(splitLessonText("A\r\rB")).toEqual(["A", "B"]);
  });

  it("collapses runs of blank lines and ignores blank space at both ends", () => {
    expect(splitLessonText("\n\n\n  A  \n\n\n\n\nB\n\n\n")).toEqual(["A", "B"]);
  });

  it("never returns an empty step and loses no words", () => {
    const text = "alpha beta\n\n\ngamma\n \ndelta epsilon\nzeta\n\n";
    const steps = splitLessonText(text);
    expect(steps.every((s) => s.length > 0 && s === s.trim())).toBe(true);
    expect(steps.join(" ").split(/\s+/)).toEqual(text.trim().split(/\s+/));
  });

  it("leaves markup exactly as typed", () => {
    expect(splitLessonText("<b>bold</b>\n\n<script>x</script> & more")).toEqual([
      "<b>bold</b>",
      "<script>x</script> & more",
    ]);
  });

  it("keeps a 20,000-character paragraph whole and handles 200 tiny paragraphs", () => {
    const long = "word ".repeat(3999).trim() + " end";
    expect(splitLessonText(long)).toEqual([long]);
    const many = Array.from({ length: 200 }, (_, i) => `P${i + 1}`).join("\n\n");
    const steps = splitLessonText(many);
    expect(steps).toHaveLength(200);
    expect(steps[199]).toBe("P200");
  });
});

describe("clampStep", () => {
  it("keeps a step inside what exists", () => {
    expect(clampStep(2, 5)).toBe(2);
    expect(clampStep(9, 5)).toBe(4);
    expect(clampStep(-3, 5)).toBe(0);
    expect(clampStep(1.9, 5)).toBe(1);
  });

  it("returns 0 for no steps or a bad number", () => {
    expect(clampStep(3, 0)).toBe(0);
    expect(clampStep(Number.NaN, 5)).toBe(0);
    expect(clampStep(Number.POSITIVE_INFINITY, 5)).toBe(0);
  });
});
