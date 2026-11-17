import type { RefObject } from "react";
import { AccessibilityInfo, findNodeHandle } from "react-native";

/** Moves screen-reader focus to an element, for example back to the control that opened a sheet. */
export function focusElement(ref: RefObject<unknown> | null | undefined): void {
  const node = ref?.current ? findNodeHandle(ref.current as never) : null;
  if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
}
