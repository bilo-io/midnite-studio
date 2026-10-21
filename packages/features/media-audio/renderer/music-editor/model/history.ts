import type { Song } from '@midnite/studio-shared';

/**
 * Undo/redo for the song document (Phase 101 Theme E). Snapshots, not patches: the edits in
 * `song-edit.ts` share every untouched track by reference, so a snapshot costs one array per step.
 * One user gesture, or one agent edit, is exactly one step.
 */
export const HISTORY_LIMIT = 200;

export type History = {
  past: Song[];
  present: Song;
  future: Song[];
  /** Commits sharing a key fold into one step (a held arrow key nudging a note). */
  key: string | null;
};

export const createHistory = (song: Song): History => ({ past: [], present: song, future: [], key: null });

/** Push `next` as one undoable step. The same reference is a no-op, so unchanged edits leave no step. */
export function commit(history: History, next: Song, key: string | null = null): History {
  if (next === history.present) return history;
  if (key !== null && key === history.key) return { ...history, present: next, future: [] };
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    key,
  };
}

export function undo(history: History): History {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    key: null,
  };
}

export function redo(history: History): History {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return { past: [...history.past, history.present], present: next, future: rest, key: null };
}

/** Replace the song outright (opening another one) and forget the steps of the old one. */
export const reset = (song: Song): History => createHistory(song);

/**
 * An edit made outside the editor — an agent's `music_*` call (Theme H) — lands as one step, never
 * folded into the user's own coalescing run, so a single Undo takes the whole agent edit back.
 */
export const commitExternal = (history: History, next: Song): History => commit({ ...history, key: null }, next, null);

export const canUndo = (history: History): boolean => history.past.length > 0;
export const canRedo = (history: History): boolean => history.future.length > 0;
