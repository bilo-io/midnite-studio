import { useSyncExternalStore } from 'react';

/**
 * Whether this document is visible — `document.visibilityState === 'visible'`.
 *
 * The other half of the poll gate beside `useWindowFocused()`: a minimised or
 * fully covered window is hidden, and a hidden window has nobody to refresh
 * anything for. One shared listener, installed with the first subscriber and
 * removed with the last, the same shape `use-window-focus.ts` takes.
 */
const listeners = new Set<() => void>();

const onChange = () => {
  for (const fn of listeners) fn();
};

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (listeners.size === 1) document.addEventListener('visibilitychange', onChange);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) document.removeEventListener('visibilitychange', onChange);
  };
}

const getSnapshot = (): boolean => document.visibilityState !== 'hidden';
const getServerSnapshot = (): boolean => true;

export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
