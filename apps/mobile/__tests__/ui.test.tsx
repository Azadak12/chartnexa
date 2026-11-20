import { fireEvent, render, screen, act } from "@testing-library/react-native";
import { AccessibilityInfo, Animated, StyleSheet, Text as RNText, View } from "react-native";
import { createRef, useState } from "react";
import { MIN_TOUCH_SIZE, MAX_FONT_SCALE } from "@chartnexa/design-tokens";
import {
  Banner,
  BottomSheet,
  Button,
  Dialog,
  IconButton,
  OverlayProvider,
  Screen,
  Skeleton,
  Text,
  TextField,
  useSubmitOnce,
} from "../src/ui";
import * as focus from "../src/ui/focus";
import { mockBackHandler } from "../test-utils/back-handler";
import { colors } from "../src/theme";
import { Pressable } from "react-native";

function flat(el: { props: { style?: unknown } }) {
  return StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;
}

describe("Text", () => {
  it("scales with the system text size up to 200 percent and sets no fixed height", async () => {
    await render(<Text testID="t">Hello</Text>);
    const el = screen.getByTestId("t");
    expect(el.props.allowFontScaling).toBe(true);
    expect(el.props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE);
    const style = flat(el);
    expect(style.height).toBeUndefined();
    expect(style.fontFamily).toMatch(/^Inter_/);
  });
});

describe("Screen", () => {
  it("has the dark page background", async () => {
    await render(
      <Screen>
        <Text>x</Text>
      </Screen>,
    );
    expect(flat(screen.getByTestId("screen")).backgroundColor).toBe(colors.page);
  });
});

describe("Button", () => {
  it("exposes role, label and state and keeps a 44pt target without a fixed height", async () => {
    await render(<Button label="Continue" onPress={() => undefined} />);
    const b = screen.getByRole("button", { name: "Continue" });
    expect(b.props.accessibilityState).toMatchObject({ disabled: false, busy: false });
    const style = flat(b);
    expect(style.minHeight).toBe(MIN_TOUCH_SIZE);
    expect(style.height).toBeUndefined();
  });

  it("renders the three variants", async () => {
    await render(
      <>
        <Button label="P" variant="primary" onPress={() => undefined} />
        <Button label="S" variant="secondary" onPress={() => undefined} />
        <Button label="T" variant="tertiary" onPress={() => undefined} />
      </>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("ignores presses while disabled or loading", async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<Button label="Go" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole("button", { name: "Go" }));
    await rerender(<Button label="Go" onPress={onPress} loading />);
    for (let i = 0; i < 3; i++) await fireEvent.press(screen.getByRole("button", { name: "Go" }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Go" }).props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });

  it("runs the action once on a double tap with useSubmitOnce", async () => {
    let resolve!: () => void;
    const action = jest.fn(() => new Promise<void>((r) => (resolve = r)));
    function Form() {
      const { run, pending } = useSubmitOnce(action);
      return <Button label="Save" loading={pending} onPress={() => void run()} />;
    }
    await render(<Form />);
    const b = screen.getByRole("button", { name: "Save" });
    await fireEvent.press(b);
    await fireEvent.press(b);
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(action).toHaveBeenCalledTimes(2);
  });
});

describe("IconButton", () => {
  it("gets a 44pt target through minimum size and hit slop, and exposes its label", async () => {
    const onPress = jest.fn();
    await render(<IconButton icon="x" accessibilityLabel="Close" onPress={onPress} size={16} />);
    const b = screen.getByRole("button", { name: "Close" });
    const style = flat(b);
    expect(style.minWidth).toBe(MIN_TOUCH_SIZE);
    expect(style.minHeight).toBe(MIN_TOUCH_SIZE);
    const slop = b.props.hitSlop as number;
    expect(16 + 2 * slop).toBeGreaterThanOrEqual(MIN_TOUCH_SIZE);
    await fireEvent.press(b);
    expect(onPress).toHaveBeenCalled();
  });

  it("rejects a missing label in development", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      render(<IconButton icon="x" accessibilityLabel="  " onPress={() => undefined} />),
    ).rejects.toThrow(/accessibilityLabel/);
    spy.mockRestore();
  });
});

describe("TextField", () => {
  it("shows a visible label and keeps the error beside the field with an icon and text", async () => {
    await render(<TextField label="Email" error="Enter a valid email" />);
    expect(screen.getByText("Email")).toBeTruthy();
    const input = screen.getByLabelText("Email");
    expect(input.props.accessibilityHint).toBe("Error: Enter a valid email");
    expect(input.props["aria-invalid"]).toBe(true);
    const err = screen.getByTestId("field-error");
    expect(err.props.accessibilityLiveRegion).toBe("polite");
    expect(screen.getByText("Enter a valid email")).toBeTruthy();
  });

  it("shows nothing extra without an error", async () => {
    await render(<TextField label="Email" />);
    expect(screen.queryByTestId("field-error")).toBeNull();
    expect(screen.getByLabelText("Email").props.accessibilityHint).toBeUndefined();
  });
});

describe("Banner", () => {
  it.each(["info", "success", "warning", "error"] as const)(
    "%s carries an icon, a label and text",
    async (kind) => {
      await render(<Banner kind={kind} message="Something happened" testID="b" />);
      const b = screen.getByTestId("b");
      expect(b.props.accessibilityLabel).toMatch(/: Something happened$/);
      expect(screen.getByText("Something happened", { exact: false })).toBeTruthy();
    },
  );
});

describe("Skeleton", () => {
  afterEach(() => jest.restoreAllMocks());

  it("does not animate when reduced motion is on", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const loop = jest.spyOn(Animated, "loop");
    await render(<Skeleton />);
    await act(async () => undefined);
    expect(loop).not.toHaveBeenCalled();
  });

  it("animates when reduced motion is off", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    const loop = jest.spyOn(Animated, "loop");
    await render(<Skeleton />);
    await act(async () => undefined);
    expect(loop).toHaveBeenCalled();
  });
});

describe("overlays and back", () => {
  function Harness({
    sheet,
    dialog,
    opener,
  }: {
    sheet: boolean;
    dialog: boolean;
    opener?: React.RefObject<unknown>;
  }) {
    const noop = () => undefined;
    return (
      <OverlayProvider>
        <View testID="underlying">
          <RNText>page</RNText>
        </View>
        <BottomSheet
          visible={sheet}
          onDismiss={noop}
          title="Reviews"
          {...(opener ? { openerRef: opener } : {})}
        >
          <RNText>sheet body</RNText>
        </BottomSheet>
        <Dialog visible={dialog} onDismiss={noop} title="Sure?">
          <RNText>dialog body</RNText>
        </Dialog>
      </OverlayProvider>
    );
  }

  function Stateful({ opener }: { opener?: React.RefObject<unknown> }) {
    const [sheet, setSheet] = useState(true);
    const [dialog, setDialog] = useState(true);
    return (
      <OverlayProvider>
        <View testID="underlying">
          <RNText>page</RNText>
        </View>
        <BottomSheet
          visible={sheet}
          onDismiss={() => setSheet(false)}
          title="Reviews"
          {...(opener ? { openerRef: opener } : {})}
        >
          <RNText>sheet body</RNText>
        </BottomSheet>
        <Dialog visible={dialog} onDismiss={() => setDialog(false)} title="Sure?">
          <RNText>dialog body</RNText>
        </Dialog>
      </OverlayProvider>
    );
  }

  it("closes a nested dialog first, then the sheet, leaving the screen underneath untouched", async () => {
    const back = mockBackHandler();
    await render(<Stateful />);
    // While the dialog is open it hides the sheet from assistive technology, as intended.
    const hidden = { includeHiddenElements: true };
    expect(screen.getByText("sheet body", hidden)).toBeTruthy();
    expect(screen.getByText("dialog body", hidden)).toBeTruthy();
    let handled = false;
    await act(async () => {
      handled = back.pressBack();
    });
    expect(handled).toBe(true);
    expect(screen.queryByText("dialog body", hidden)).toBeNull();
    expect(screen.getByText("sheet body", hidden)).toBeTruthy();
    await act(async () => {
      handled = back.pressBack();
    });
    expect(handled).toBe(true);
    expect(screen.queryByText("sheet body", hidden)).toBeNull();
    expect(screen.getByText("page", hidden)).toBeTruthy();
    // Nothing left open: back is not handled, so the router goes back.
    expect(back.pressBack()).toBe(false);
    back.restore();
  });

  it("reports back as unhandled when no overlay is open", async () => {
    const back = mockBackHandler();
    await render(<Harness sheet={false} dialog={false} />);
    expect(back.pressBack()).toBe(false);
    back.restore();
  });

  it("closes the sheet from the close button and returns focus to the opener", async () => {
    const opener = createRef<unknown>();
    const spy = jest.spyOn(focus, "focusElement").mockImplementation(() => undefined);
    function WithOpener() {
      const [open, setOpen] = useState(true);
      return (
        <OverlayProvider>
          <Pressable ref={opener as never} testID="opener" onPress={() => setOpen(true)}>
            <RNText>open</RNText>
          </Pressable>
          <BottomSheet
            visible={open}
            onDismiss={() => setOpen(false)}
            title="Reviews"
            openerRef={opener}
          >
            <RNText>sheet body</RNText>
          </BottomSheet>
        </OverlayProvider>
      );
    }
    await render(<WithOpener />);
    await fireEvent.press(screen.getByRole("button", { name: "Close Reviews" }));
    expect(screen.queryByText("sheet body")).toBeNull();
    expect(spy).toHaveBeenCalledWith(opener);
    spy.mockRestore();
  });

  it("exposes the sheet title as a header", async () => {
    await render(<Harness sheet dialog={false} />);
    expect(screen.getByRole("header", { name: "Reviews" })).toBeTruthy();
  });
});
