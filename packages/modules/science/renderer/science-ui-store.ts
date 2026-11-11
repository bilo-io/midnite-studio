import { createPersistedStore } from '@midnite/studio-frame';
import type { StoreApi } from 'zustand';

type Persisted = { v: 1; lastNotebookId: string | null };

export type ScienceUiState = Persisted & {
  setLastNotebookId: (id: string | null) => void;
};

const DEFAULTS: Persisted = { v: 1, lastNotebookId: null };

/**
 * What Science remembers across launches in this window's localStorage: the notebook open last.
 * `createPersistedStore` has no `migrate`, so the version check lives in `state`: a stored blob whose
 * `v` is not 1 is replaced by the defaults.
 */
export function createScienceUiStore(storage?: Storage): StoreApi<ScienceUiState> {
  return createPersistedStore<ScienceUiState, Persisted>({
    key: 'midnite-science.ui',
    defaults: DEFAULTS,
    pick: ({ v, lastNotebookId }) => ({ v, lastNotebookId }),
    ...(storage ? { storage } : {}),
    state: (set, initial) => {
      const safe = initial.v === 1 ? initial : DEFAULTS;
      return { ...safe, setLastNotebookId: (lastNotebookId) => set({ lastNotebookId }) };
    },
  });
}

let shared: StoreApi<ScienceUiState> | null = null;
/** The app-wide store (lazy, so a test can build its own with `createScienceUiStore`). */
export function scienceUiStore(): StoreApi<ScienceUiState> {
  shared ??= createScienceUiStore();
  return shared;
}
