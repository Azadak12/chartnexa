import { render, screen } from "@testing-library/react-native";
import { SplitBar } from "../src/kit/SplitBar";

const parts = [
  { label: "Published", value: 3, color: "#16B89A" },
  { label: "Draft", value: 1, color: "#D8AD66" },
];

describe("SplitBar", () => {
  it("describes real counts in text and shows each count as text", async () => {
    await render(<SplitBar title="Courses by status" parts={parts} />);
    expect(screen.getByLabelText("Courses by status: 3 Published, 1 Draft")).toBeTruthy();
    expect(screen.getByText("Published: 3")).toBeTruthy();
    expect(screen.getByText("Draft: 1")).toBeTruthy();
  });
  it("omits zero-value parts from the bar and renders nothing for an empty total", async () => {
    const { rerender } = await render(
      <SplitBar title="T" parts={[parts[0]!, { ...parts[1]!, value: 0 }]} />,
    );
    expect(screen.queryByTestId("split-bar-Draft")).toBeNull();
    await rerender(<SplitBar title="T" parts={parts.map((p) => ({ ...p, value: 0 }))} />);
    expect(screen.queryByTestId("split-bar")).toBeNull();
  });
});
