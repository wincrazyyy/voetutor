"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The canonical two-click destructive haptic, lifted from the class-roster "Remove" precedent:
 * the first activation ARMS (the caller restyles the control), a second within `disarmMs`
 * confirms; otherwise it auto-disarms. Also disarms when a `pending` action completes, and
 * exposes `disarm` for blur/Escape/outside-interaction. Timer is cleaned up on unmount.
 */
export function useArmedConfirm({
  disarmMs = 4000,
  pending = false,
  onArmedChange,
}: {
  disarmMs?: number;
  /** The caller's in-flight state — while true the armed styling is held, on completion it disarms. */
  pending?: boolean;
  onArmedChange?: (armed: boolean) => void;
} = {}) {
  const [armed, setArmedState] = useState(false);
  const armedRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPending = useRef(false);
  const notify = useRef(onArmedChange);
  notify.current = onArmedChange;

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const setArmed = useCallback((next: boolean) => {
    if (armedRef.current === next) return;
    armedRef.current = next;
    setArmedState(next);
    notify.current?.(next);
  }, []);

  const disarm = useCallback(() => {
    clearTimer();
    setArmed(false);
  }, [clearTimer, setArmed]);

  const arm = useCallback(() => {
    setArmed(true);
    clearTimer();
    timer.current = setTimeout(() => setArmed(false), disarmMs);
  }, [clearTimer, disarmMs, setArmed]);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      clearTimer();
    } else if (wasPending.current) {
      wasPending.current = false;
      setArmed(false);
    }
  }, [pending, clearTimer, setArmed]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { armed, arm, disarm };
}
