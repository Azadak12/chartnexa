import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { BackHandler } from "react-native";

interface Entry {
  id: number;
  dismiss: () => void;
}

interface OverlayApi {
  register: (dismiss: () => void) => () => void;
  /** Closes the topmost overlay; returns false when none is open. */
  dismissTop: () => boolean;
}

const OverlayContext = createContext<OverlayApi | null>(null);

/**
 * Keeps the stack of open overlays (sheets, dialogs). Hardware back on Android closes the
 * topmost one before the router is allowed to go back (ADR-0010).
 */
export function OverlayProvider({ children }: { children: ReactNode }) {
  const stack = useRef<Entry[]>([]);
  const nextId = useRef(1);

  const dismissTop = useCallback((): boolean => {
    const top = stack.current[stack.current.length - 1];
    if (!top) return false;
    top.dismiss();
    return true;
  }, []);

  const register = useCallback((dismiss: () => void) => {
    const entry = { id: nextId.current++, dismiss };
    stack.current.push(entry);
    return () => {
      stack.current = stack.current.filter((e) => e.id !== entry.id);
    };
  }, []);

  useEffect(() => {
    // Returning true marks the event handled, so the router does not also go back.
    const sub = BackHandler.addEventListener("hardwareBackPress", dismissTop);
    return () => sub.remove();
  }, [dismissTop]);

  const api = useMemo(() => ({ register, dismissTop }), [register, dismissTop]);
  return <OverlayContext.Provider value={api}>{children}</OverlayContext.Provider>;
}

export function useOverlays(): OverlayApi {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error("useOverlays must be used inside OverlayProvider");
  return ctx;
}

/** Registers an overlay while it is open so back dismisses it in the right order. */
export function useOverlayRegistration(open: boolean, onDismiss: () => void): void {
  const { register } = useOverlays();
  const latest = useRef(onDismiss);
  latest.current = onDismiss;
  useEffect(() => {
    if (!open) return;
    return register(() => latest.current());
  }, [open, register]);
}
