import { createPersistedStore } from '@midnite/studio-frame';
import type { StoreApi } from 'zustand';

export type ProgressRange = '30d' | '90d' | '1y';
type Persisted = { v: 1; range: ProgressRange };

export type HealthUiState = Persisted & { setRange: (range: ProgressRange) => void };

const DEFAULTS: Persisted = { v: 1, range: '90d' };
const RANGES: ProgressRange[] = ['30d', '90d', '1y'];

/**
 * What Health remembers across launches in this window's localStorage: the Progress range. A stored blob
 * whose `v` is not 1 (or whose range is unknown) reads as the defaults.
 */
export function createHealthUiStore(storage?: Storage): StoreApi<HealthUiState> {
  return createPersistedStore<HealthUiState, Persisted>({
    key: 'midnite-health.ui',
    defaults: DEFAULTS,
    pick: ({ v, range }) => ({ v, range }),
    ...(storage ? { storage } : {}),
    state: (set, initial) => {
      const safe = initial.v === 1 && RANGES.includes(initial.range) ? initial : DEFAULTS;
      return { ...safe, setRange: (range) => set({ range }) };
    },
  });
}

let shared: StoreApi<HealthUiState> | null = null;
/** The app-wide store (lazy, so a test can build its own with `createHealthUiStore`). */
export function healthUiStore(): StoreApi<HealthUiState> {
  shared ??= createHealthUiStore();
  return shared;
}
