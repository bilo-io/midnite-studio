/**
 * The open doc's load/edit/save state (Phase 99 Theme B), as a pure reducer.
 *
 * - `base` is what we last know to be on disk; `draft` is the editor's text.
 *   Dirty = they differ.
 * - A disk read that differs from `base` is an **external change**: it
 *   reloads the editor when there are no unsaved edits, and raises the
 *   `conflict` banner when there are.
 * - `nonce` bumps whenever the editor must take new content from outside
 *   (first load, reload, an accepted AI edit) — the editor remounts on it.
 */
export type DocSessionState = {
  key: string | null;
  base: string | null;
  draft: string | null;
  nonce: number;
  conflict: boolean;
};

export type DocSessionAction =
  | { type: 'open'; key: string | null }
  | { type: 'disk'; text: string }
  | { type: 'edit'; text: string }
  | { type: 'saved'; text: string }
  | { type: 'reload'; text: string }
  | { type: 'keepMine'; text: string }
  | { type: 'replace'; text: string };

export const INITIAL_DOC_SESSION: DocSessionState = { key: null, base: null, draft: null, nonce: 0, conflict: false };

export const isDirty = (s: DocSessionState): boolean => s.draft !== null && s.draft !== s.base;

export function docSessionReducer(state: DocSessionState, action: DocSessionAction): DocSessionState {
  switch (action.type) {
    case 'open':
      return action.key === state.key ? state : { ...INITIAL_DOC_SESSION, key: action.key, nonce: state.nonce + 1 };
    case 'disk': {
      if (state.base === null) return { ...state, base: action.text, draft: action.text, nonce: state.nonce + 1 };
      if (action.text === state.base) return state;
      // Our own save arriving back through the watcher.
      if (action.text === state.draft) return { ...state, base: action.text, conflict: false };
      if (!isDirty(state)) return { ...state, base: action.text, draft: action.text, nonce: state.nonce + 1 };
      return { ...state, conflict: true };
    }
    case 'edit':
      return state.draft === action.text ? state : { ...state, draft: action.text };
    case 'saved':
      return { ...state, base: action.text };
    case 'reload':
      return { ...state, base: action.text, draft: action.text, conflict: false, nonce: state.nonce + 1 };
    case 'keepMine':
      // Adopt the disk text as the base so the next save overwrites it.
      return { ...state, base: action.text, conflict: false };
    case 'replace':
      return { ...state, draft: action.text, nonce: state.nonce + 1 };
  }
}
