import { useCallback, useEffect, useRef } from 'react';

/**
 * A debounced save whose pending value can be forced through on demand
 * (Phase 42 Theme C) — `schedule` restarts the timer, `flush` fires
 * immediately (clearing the timer) and also runs automatically on unmount.
 *
 * Extracted because the original `council-detail.tsx` inline version
 * (`scheduleSave`) closed over its arguments directly rather than reading a
 * ref, so there was nothing for a `flush()` to re-send — and its unmount
 * cleanup cleared the timer *without* firing it, silently dropping an edit
 * made inside the debounce window. Both are fixed by routing every write
 * through `pendingRef` here.
 *
 * *Acceptance:* schedule, then unmount before the timer fires — `save` is
 * still called exactly once, with the last scheduled value.
 */
export function useFlushableSave<T>(save: (value: T) => void, delayMs: number): { schedule: (value: T) => void } {
  const pendingRef = useRef<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current !== null) {
      saveRef.current(pendingRef.current);
      pendingRef.current = null;
    }
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pendingRef.current = value;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, delayMs);
    },
    [flush, delayMs],
  );

  // Flush, not merely clear, on unmount — a scheduled edit still inside the
  // debounce window when the config panel unmounts (a council switch, a
  // navigation) must still reach the server.
  useEffect(() => flush, [flush]);

  return { schedule };
}
