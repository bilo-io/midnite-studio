import { useSyncExternalStore } from 'react';

/**
 * One wall clock for the whole renderer (Phase 36 E).
 *
 * Three components used to run a `setInterval(…, 1000)` each — the titlebar
 * status, its time section, its world clocks — so an idle window woke React
 * three times a second forever, and a fourth timer polled for screensaver
 * idleness. This replaces them with a single interval that exists only while
 * something is subscribed **and** the document is visible: a blurred or hidden
 * window costs nothing, which is the whole point.
 *
 * The tick re-aligns to the next wall-clock second rather than firing every
 * 1000ms from whenever the first subscriber mounted. Without that, a clock
 * mounted at .700 of a second displays each new minute up to 999ms late, and
 * two clocks mounted at different moments visibly disagree.
 *
 * `getSnapshot` returns a cached `Date` — the same object between ticks — so
 * `useSyncExternalStore` sees a stable value and does not re-render in a loop.
 */

const listeners = new Set<() => void>();

let current = new Date();
let timer: ReturnType<typeof setTimeout> | null = null;
/** Installed lazily with the first subscriber, torn down with the last. */
let visibilityBound = false;

const hidden = (): boolean =>
  typeof document !== 'undefined' && document.visibilityState === 'hidden';

function tick(): void {
  current = new Date();
  for (const fn of listeners) fn();
  schedule();
}

/** Sleep only as long as the remainder of the current second. */
function schedule(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (listeners.size === 0 || hidden()) return;
  timer = setTimeout(tick, 1_000 - (Date.now() % 1_000));
}

function onVisibilityChange(): void {
  if (hidden()) {
    schedule(); // clears the timer — `schedule` bails while hidden
    return;
  }
  // Snap forward on return: the displayed time is as stale as the time spent
  // hidden, and a user looking back at the window must not read a wrong clock.
  current = new Date();
  for (const fn of listeners) fn();
  schedule();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (!visibilityBound && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
    visibilityBound = true;
  }
  // A subscriber joining after the window was hidden would otherwise read a
  // `current` frozen at the moment it was hidden.
  if (!hidden()) current = new Date();
  schedule();

  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (visibilityBound && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        visibilityBound = false;
      }
    }
  };
}

const getSnapshot = (): Date => current;

/**
 * The current time, re-rendering the caller once a second while the window is
 * visible. Every caller shares one timer.
 */
export function useNow(): Date {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Test seam — how many timers this module currently holds (0 or 1). */
export function __nowTimerCount(): number {
  return timer === null ? 0 : 1;
}

/** Test seam — live subscriber count. */
export function __nowSubscriberCount(): number {
  return listeners.size;
}
