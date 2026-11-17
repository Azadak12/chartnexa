import { BackHandler } from "react-native";

type Listener = () => boolean | null | undefined;

/**
 * Captures Android hardware-back listeners and lets a test press back. Like React Native, the
 * most recently added listener runs first and the first one returning true stops the chain.
 */
export function mockBackHandler() {
  const listeners: Listener[] = [];
  const spy = jest.spyOn(BackHandler, "addEventListener").mockImplementation(((
    _event: string,
    handler: Listener,
  ) => {
    listeners.push(handler);
    return {
      remove: () => {
        const i = listeners.indexOf(handler);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
  }) as never);
  return {
    /** Returns true when some listener handled the press (so the router should not go back). */
    pressBack(): boolean {
      for (let i = listeners.length - 1; i >= 0; i--) {
        if (listeners[i]?.() === true) return true;
      }
      return false;
    },
    restore: () => spy.mockRestore(),
  };
}
