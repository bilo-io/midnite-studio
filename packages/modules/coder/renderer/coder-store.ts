import { createPersistedStore } from '@midnite/studio-frame';
import { useStore } from 'zustand';

import { CODER_HOME, type CoderViewId } from '../manifest';

/**
 * What Coder remembers across launches, in this window's localStorage: the selected repository, the
 * open view and the "review actions" switch (off by default, as in Studio — a fresh install cannot
 * write to a forge until the user says so). The repository list itself lives in main.
 */
type Persisted = { selectedRepoId: string | null; view: CoderViewId; writesEnabled: boolean };

export type CoderState = Persisted & {
  selectRepo: (repoId: string | null) => void;
  setView: (view: CoderViewId) => void;
  setWritesEnabled: (on: boolean) => void;
};

export const coderStore = createPersistedStore<CoderState, Persisted>({
  key: 'midnite-coder.ui',
  defaults: { selectedRepoId: null, view: CODER_HOME, writesEnabled: false },
  pick: ({ selectedRepoId, view, writesEnabled }) => ({ selectedRepoId, view, writesEnabled }),
  state: (set, initial) => ({
    ...initial,
    selectRepo: (selectedRepoId) => set({ selectedRepoId }),
    setView: (view) => set({ view }),
    setWritesEnabled: (writesEnabled) => set({ writesEnabled }),
  }),
});

export function useCoderStore<T>(selector: (state: CoderState) => T): T {
  return useStore(coderStore, selector);
}
