import { act, renderHook } from "@testing-library/react-native";

const mockUseFonts = jest.fn();
jest.mock("expo-font", () => ({ useFonts: (...a: unknown[]) => mockUseFonts(...a) }));
jest.unmock("../src/fonts/use-app-fonts");

import { FONT_TIMEOUT_MS, INTER_WEIGHTS, useAppFonts } from "../src/fonts/use-app-fonts";

describe("useAppFonts", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("requests only the four weights the app uses", async () => {
    mockUseFonts.mockReturnValue([false, null]);
    await renderHook(() => useAppFonts());
    expect(Object.keys(mockUseFonts.mock.calls[0]?.[0] as object).sort()).toEqual(
      ["Inter_400Regular", "Inter_500Medium", "Inter_600SemiBold", "Inter_700Bold"].sort(),
    );
    expect(Object.keys(INTER_WEIGHTS)).toHaveLength(4);
  });

  it("waits while Inter loads, then lets the app render", async () => {
    mockUseFonts.mockReturnValue([false, null]);
    const { result, rerender } = await renderHook(() => useAppFonts());
    expect(result.current).toBe(false);
    mockUseFonts.mockReturnValue([true, null]);
    await rerender({});
    expect(result.current).toBe(true);
  });

  it("starts with the system font when loading fails", async () => {
    mockUseFonts.mockReturnValue([false, new Error("network")]);
    const { result } = await renderHook(() => useAppFonts());
    expect(result.current).toBe(true);
  });

  it("starts with the system font when loading is too slow", async () => {
    mockUseFonts.mockReturnValue([false, null]);
    const { result } = await renderHook(() => useAppFonts());
    expect(result.current).toBe(false);
    await act(async () => jest.advanceTimersByTime(FONT_TIMEOUT_MS + 1));
    expect(result.current).toBe(true);
  });
});
