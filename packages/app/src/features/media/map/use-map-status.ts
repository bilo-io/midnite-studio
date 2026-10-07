import { useSyncExternalStore } from 'react';

/**
 * What the Maps canvas reports about its tiles (Phase 108 Theme A): whether tiles are still loading,
 * how many failed (counted, never `console.error`ed one by one), the first failure, and whether the
 * style itself could not load. A tiny external store so `map-canvas.tsx` (the lazy chunk) and the
 * tab's footer chip and offline panel share it without a prop chain through `Suspense`.
 */
export type MapStatus = {
  online: boolean;
  loading: boolean;
  failed: number;
  firstError: { source: string; status: string } | null;
  styleFailed: boolean;
};

const initial = (): Omit<MapStatus, 'online'> => ({ loading: false, failed: 0, firstError: null, styleFailed: false });

let state = initial();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const mapStatusStore = {
  patch(next: Partial<Omit<MapStatus, 'online'>>) {
    state = { ...state, ...next };
    emit();
  },
  reset() {
    state = initial();
    emit();
  },
  /** A failed tile: bumps the counter and remembers the first source and status. */
  recordTileError(source: string, status: string) {
    state = { ...state, failed: state.failed + 1, firstError: state.firstError ?? { source, status } };
    emit();
  },
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
};

let cached: MapStatus | null = null;
const snapshot = (): MapStatus => {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (!cached || cached.online !== online || cached.loading !== state.loading || cached.failed !== state.failed || cached.firstError !== state.firstError || cached.styleFailed !== state.styleFailed) {
    cached = { online, ...state };
  }
  return cached;
};

export function useMapStatus(): MapStatus {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
