import { create } from 'zustand';

import {
  backHistoryState,
  forwardHistoryState,
  pushHistoryState,
  replaceHistoryState,
  type PanelHistory,
  type PanelHistoryState,
} from '../../components/panel-stack/use-panel-history';

/**
 * Councils' own navigation stack (Phase 42 Theme E) — a zustand store rather
 * than `usePanelHistory`'s own `useState`, and the one deliberate exception
 * to that primitive's "panel-local, not a store" rule (see its own
 * docblock). Councils is lazy-loaded and unmounts on view switch, so a
 * component-local `useState` resets to `{kind:'list'}` the moment you leave
 * and come back within a session — exactly the gap this batch's own upfront
 * review named. A module-level store survives the unmount; it is still
 * **not persisted** (no `partialize` entry, no localStorage), matching
 * `viewHistory`'s own precedent: *"session-only, so a restart does not hand
 * the user a 'back' button to a view from last time."*
 *
 * Reuses `use-panel-history.ts`'s exported pure transitions rather than
 * re-deriving the depth-cap/index arithmetic — the one thing worth getting
 * wrong exactly once.
 */
export type CouncilEntry =
  | { kind: 'list' }
  | { kind: 'council'; id: string }
  | { kind: 'run'; id: string; councilId: string };

export function isSameCouncilEntry(a: CouncilEntry, b: CouncilEntry): boolean {
  switch (a.kind) {
    case 'list':
      return b.kind === 'list';
    case 'council':
      return b.kind === 'council' && b.id === a.id;
    case 'run':
      return b.kind === 'run' && b.id === a.id;
  }
}

/** The council a stack entry belongs to — `null` only for the root `'list'` entry. */
export function councilIdOf(entry: CouncilEntry): string | null {
  switch (entry.kind) {
    case 'list':
      return null;
    case 'council':
      return entry.id;
    case 'run':
      return entry.councilId;
  }
}

const INITIAL: CouncilEntry = { kind: 'list' };

type StoreState = PanelHistoryState<CouncilEntry> & {
  push: (entry: CouncilEntry) => void;
  replace: (entry: CouncilEntry) => void;
  back: () => void;
  forward: () => void;
  reset: (entry?: CouncilEntry) => void;
};

const useCouncilsHistoryStore = create<StoreState>((set) => ({
  entries: [INITIAL],
  index: 0,
  push: (entry) => set((prev) => pushHistoryState(prev, entry, isSameCouncilEntry)),
  replace: (entry) => set((prev) => replaceHistoryState(prev, entry)),
  back: () => set(backHistoryState),
  forward: () => set(forwardHistoryState),
  reset: (entry) => set({ entries: [entry ?? INITIAL], index: 0 }),
}));

/**
 * Reads the store in the same `PanelHistory<CouncilEntry>` shape
 * `usePanelHistory` returns, so `PanelStack`/`PanelHeader` — both typed
 * against that shape — work unchanged whether a consumer holds its stack
 * locally or, like Councils, in this module-level store.
 */
export function useCouncilsHistory(): PanelHistory<CouncilEntry> {
  const entries = useCouncilsHistoryStore((s) => s.entries);
  const index = useCouncilsHistoryStore((s) => s.index);
  const push = useCouncilsHistoryStore((s) => s.push);
  const replace = useCouncilsHistoryStore((s) => s.replace);
  const back = useCouncilsHistoryStore((s) => s.back);
  const forward = useCouncilsHistoryStore((s) => s.forward);
  const reset = useCouncilsHistoryStore((s) => s.reset);

  return {
    entries,
    index,
    current: entries[index] as CouncilEntry,
    push,
    replace,
    back,
    forward,
    reset,
    canGoBack: index > 0,
    canGoForward: index < entries.length - 1,
  };
}
