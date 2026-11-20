import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { ClassroomStage } from "../src/classroom/ClassroomStage";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

const mountStage = () =>
  render(
    <ClassroomStage courseId="c1">
      <Text testID="player">the real lesson player</Text>
    </ClassroomStage>,
  );

describe("ClassroomStage", () => {
  beforeEach(() => mockPush.mockClear());

  it("keeps the real player mounted in every camera view", async () => {
    await mountStage();
    for (const name of ["Classroom", "Focus screen", "Desk"]) {
      await fireEvent.press(screen.getByRole("button", { name }));
      expect(screen.getByTestId("player")).toBeTruthy();
    }
  });

  it("hides the desk in focus view and brings it back", async () => {
    await mountStage();
    expect(screen.getByTestId("classroom-desk")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Focus screen" }));
    expect(screen.queryByTestId("classroom-desk")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Desk" }));
    expect(screen.getByTestId("classroom-desk")).toBeTruthy();
  });

  it("opens only existing destinations from the desk", async () => {
    await mountStage();
    await fireEvent.press(screen.getByRole("button", { name: "Open course lessons" }));
    expect(mockPush).toHaveBeenLastCalledWith("/course/c1");
    await fireEvent.press(screen.getByRole("button", { name: "Open assignments" }));
    expect(mockPush).toHaveBeenLastCalledWith("/assignments");
    await fireEvent.press(screen.getByRole("button", { name: "Open my learning" }));
    expect(mockPush).toHaveBeenLastCalledWith("/courses");
  });

  it("says plainly that the room is placeholder scenery", async () => {
    await mountStage();
    expect(screen.getByTestId("classroom-art-notice")).toBeTruthy();
  });
});
