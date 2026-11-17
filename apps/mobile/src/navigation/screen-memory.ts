import { useCallback, useEffect, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

/** The part of a ScrollView or FlatList instance that scroll restoration needs. */
interface Scrollable {
  scrollTo?: (options: { y: number; animated: boolean }) => void;
  scrollToOffset?: (options: { offset: number; animated: boolean }) => void;
}

interface Entry {
  scrollY?: number;
  state?: unknown;
}

// In memory only: never written to disk, cleared on sign-out.
const memory = new Map<string, Entry>();

export function clearScreenMemory(): void {
  memory.clear();
}

/** Remembers one value (for example active filters) for a screen, under that screen's own key. */
export function useScreenMemoryState<T>(key: string, initial: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => (memory.get(key)?.state as T | undefined) ?? initial);
  const set = useCallback(
    (next: T) => {
      memory.set(key, { ...memory.get(key), state: next });
      setValue(next);
    },
    [key],
  );
  return [value, set];
}

/**
 * Scroll position memory for a ScrollView or FlatList. Spread `props` onto the list and attach
 * `ref`. The saved offset is restored once the content has been measured.
 */
export function useRestorableScroll(key: string) {
  const ref = useRef<Scrollable | null>(null);
  const restored = useRef(false);

  useEffect(() => {
    restored.current = false;
  }, [key]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      memory.set(key, { ...memory.get(key), scrollY: e.nativeEvent.contentOffset.y });
    },
    [key],
  );

  const onContentSizeChange = useCallback(() => {
    if (restored.current) return;
    const y = memory.get(key)?.scrollY;
    if (y && y > 0) {
      ref.current?.scrollTo?.({ y, animated: false });
      ref.current?.scrollToOffset?.({ offset: y, animated: false });
    }
    restored.current = true;
  }, [key]);

  return { ref, props: { onScroll, onContentSizeChange, scrollEventThrottle: 16 } };
}
