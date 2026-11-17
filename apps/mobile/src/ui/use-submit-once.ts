import { useCallback, useRef, useState } from "react";

/**
 * Wraps an async action so repeated triggers are ignored while one is running.
 * The ref guards the very first synchronous double tap, before state re-renders.
 */
export function useSubmitOnce<A extends unknown[]>(action: (...args: A) => Promise<void> | void) {
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async (...args: A): Promise<void> => {
      if (running.current) return;
      running.current = true;
      setPending(true);
      try {
        await action(...args);
      } finally {
        running.current = false;
        setPending(false);
      }
    },
    [action],
  );
  return { run, pending };
}
