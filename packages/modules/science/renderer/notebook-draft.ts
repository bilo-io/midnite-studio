import { createStore, type StoreApi } from 'zustand';

import type { GitOpResult, ScienceCell, ScienceNotebook } from '@midnite/studio-shared';

/** Quiet time after the last edit before the draft is written. */
export const AUTOSAVE_MS = 600;

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** A fresh cell id, `c-` plus eight of `[a-z0-9]`. */
export function newCellId(): string {
  let out = 'c-';
  for (let i = 0; i < 8; i += 1) out += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return out;
}

export type CellKind = ScienceCell['kind'];

/** A new, empty cell of `kind`. */
export function blankCell(kind: CellKind): ScienceCell {
  const id = newCellId();
  switch (kind) {
    case 'markdown':
      return { kind, id, source: '' };
    case 'compute':
      return { kind, id, source: '' };
    case 'plot':
      return { kind, id, series: [{ expr: 'sin(x)' }], x: { min: -6.28, max: 6.28 }, y: 'auto' };
    case 'molecule':
      return { kind, id, name: '', format: 'xyz', text: '' };
  }
}

export type NotebookDraftState = {
  notebook: ScienceNotebook;
  dirty: boolean;
  /** The last write's failure, shown as "Not saved"; cleared by the next success. */
  error: string | null;
};

export type NotebookDraft = StoreApi<NotebookDraftState> & {
  /** Replaces the cells and schedules a write. */
  setCells: (update: (cells: ScienceCell[]) => ScienceCell[]) => void;
  /** Applies a rename that has already been saved: no write is scheduled. */
  setSavedTitle: (title: string) => void;
  /** Writes now if dirty; resolves once the write settles. */
  flush: () => Promise<void>;
  /** Cancels the timer; call after the final `flush`. */
  dispose: () => void;
};

export type NotebookDraftOptions = {
  notebook: ScienceNotebook;
  write: (notebook: ScienceNotebook) => Promise<GitOpResult<{ updatedAt: string }>>;
  onSaved?: (updatedAt: string) => void;
  delayMs?: number;
};

/**
 * The notebook being edited (Phase 126 Theme C.2): every edit marks it dirty and schedules a `write`
 * `AUTOSAVE_MS` after the last one; `flush` writes immediately. A failed write keeps the draft dirty.
 */
export function createNotebookDraft(opts: NotebookDraftOptions): NotebookDraft {
  const store = createStore<NotebookDraftState>(() => ({ notebook: opts.notebook, dirty: false, error: null }));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> = Promise.resolve();
  let revision = 0;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const run = async (): Promise<void> => {
    if (!store.getState().dirty) return;
    const sent = revision;
    const { notebook } = store.getState();
    let result: GitOpResult<{ updatedAt: string }>;
    try {
      result = await opts.write(notebook);
    } catch (e) {
      result = { ok: false, kind: 'error', message: e instanceof Error ? e.message : String(e) };
    }
    if (result.ok) {
      // An edit made while the write was in flight keeps the draft dirty.
      store.setState({ dirty: revision !== sent, error: null });
      opts.onSaved?.(result.value.updatedAt);
    } else {
      store.setState({ error: result.kind === 'error' ? result.message : 'Conflict' });
    }
  };

  const flush = (): Promise<void> => {
    clear();
    inFlight = inFlight.then(run);
    return inFlight;
  };

  return {
    ...store,
    setCells(update) {
      revision += 1;
      const { notebook } = store.getState();
      store.setState({ notebook: { ...notebook, cells: update(notebook.cells) }, dirty: true });
      clear();
      timer = setTimeout(() => void flush(), opts.delayMs ?? AUTOSAVE_MS);
    },
    setSavedTitle(title) {
      store.setState({ notebook: { ...store.getState().notebook, title } });
    },
    flush,
    dispose: clear,
  };
}

/** Moves cell `index` by `delta`, clamped to the list. */
export function moveCell(cells: ScienceCell[], index: number, delta: -1 | 1): ScienceCell[] {
  const to = index + delta;
  if (to < 0 || to >= cells.length) return cells;
  const next = [...cells];
  const [cell] = next.splice(index, 1);
  next.splice(to, 0, cell!);
  return next;
}
