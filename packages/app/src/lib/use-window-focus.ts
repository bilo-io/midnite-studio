import { useSyncExternalStore } from 'react';

/**
 * Whether this window currently has focus (Phase 39).
 *
 * Exists to gate a *permanently mounted* animation. The status bar's loop
 * launchers pulse while a loop is running, and the status bar is up for the
 * app's whole life — which is precisely the shape Phase 36 Theme E was written
 * about, where an unnoticed always-on animation was costing measurable CPU on a
 * window nobody was looking at. A blurred window pulses nothing; the running
 * state itself (full opacity, coloured glow) stays completely legible, so
 * nothing is lost but the motion.
 *
 * **Focus, not `visibilityState`.** [`use-now.ts`](./use-now.ts) gates on
 * visibility because a hidden document genuinely cannot be read. A *blurred*
 * window is still on screen and still readable — it is just not the one being
 * worked in, and animating it is what costs. `document.hasFocus()` is the only
 * signal that distinguishes the two.
 *
 * One module-level listener pair shared by every subscriber, installed with the
 * first and removed with the last, following `use-now.ts`'s pattern rather than
 * a `useEffect` per component.
 */
const listeners = new Set<() => void>();

let focused = typeof document === 'undefined' ? true : document.hasFocus();
let bound = false;

function publish(next: boolean): void {
  if (next === focused) return;
  focused = next;
  for (const fn of listeners) fn();
}

const onFocus = () => publish(true);
const onBlur = () => publish(false);

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (!bound && typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    bound = true;
    // Re-read on the first subscription: the module was evaluated at import
    // time, which may have been before the window took focus.
    focused = document.hasFocus();
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && bound && typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      bound = false;
    }
  };
}

const getSnapshot = (): boolean => focused;
/** Server/`jsdom`-without-focus render: assume focused, so nothing is hidden. */
const getServerSnapshot = (): boolean => true;

export function useWindowFocused(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
