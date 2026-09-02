import { useSyncExternalStore } from 'react';

/**
 * Subscribed once at module scope, not per render: `useSyncExternalStore`
 * compares the subscribe function by identity and would tear the listener down
 * and re-add it on every render given an inline one.
 */
const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};

/**
 * The window's inner width, re-read on every resize.
 *
 * For the one drag bound in the app that is a SHARE of the window rather than a
 * pixel count — the FAB panel's, which goes to 60% of the window however wide
 * that is. Every other pane's bounds are absolute pixels, which is right for a
 * list whose rows have a natural width; the FAB panel holds documents and
 * chat, which want as much of the window as the user is willing to give them.
 */
export const useViewportWidth = (): number =>
  useSyncExternalStore(
    subscribe,
    () => window.innerWidth,
    // No window to measure (a non-DOM render): 0 falls through every `max(min,
    // …)` at the call sites, so the pane gets its minimum rather than a NaN.
    () => 0,
  );
