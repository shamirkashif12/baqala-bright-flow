import { useEffect, useRef } from "react";

/**
 * Resets an abandoned in-progress cart back to the idle screen after inactivity.
 *
 * `onIdle` is kept in a ref rather than the effect's dependency array — callers
 * pass an inline closure that captures component state (cart, dialog-open flags,
 * etc.), so a new function identity is created on every render. Depending on it
 * directly would tear down and re-add the window-level listeners below on every
 * keystroke while scanning/typing, which is what made typing feel laggy.
 */
export function useIdleTimeout(onIdle: () => void, timeoutMs = 60_000) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    function reset() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onIdleRef.current(), timeoutMs);
    }

    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset));
    reset();

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [timeoutMs]);
}
