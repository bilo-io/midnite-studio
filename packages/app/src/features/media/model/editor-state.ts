import type { ModelPart, ModelSpec } from '@midnite/studio-shared';

/**
 * The model editor's document state — pure, so undo/redo and selection are
 * unit-tested without a canvas. The document is the `ModelSpec` itself: every
 * edit (a gizmo drag, a colour, a typed number, a delete) is one history step,
 * and Save/Export hand that same spec to main.
 */
export const HISTORY_LIMIT = 100;

export type Vec3 = [number, number, number];
export type PartPatch = Partial<Pick<ModelPart, 'name' | 'color' | 'position' | 'rotation' | 'scale'>>;

export type EditorState = {
  spec: ModelSpec;
  /** The spec as last saved (or loaded) — `dirty` is "not this one". */
  saved: ModelSpec;
  past: ModelSpec[];
  future: ModelSpec[];
  selected: number | null;
  /** Which file the document came from — the editor shows only once this matches the selection. */
  source: string;
};

export type EditorAction =
  | { type: 'load'; spec: ModelSpec; source: string }
  | { type: 'select'; index: number | null }
  | { type: 'patch'; index: number; patch: PartPatch }
  | { type: 'remove'; index: number }
  | { type: 'duplicate'; index: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'markSaved' }
  /** An agent edited this model: adopt its design as one undoable step; `saved` when the files match it. */
  | { type: 'external'; spec: ModelSpec; source: string; saved: boolean };

export const initialEditorState = (spec: ModelSpec, source = ''): EditorState => ({ spec, saved: spec, past: [], future: [], selected: null, source });

export const isDirty = (state: EditorState): boolean => state.spec !== state.saved;
export const canUndo = (state: EditorState): boolean => state.past.length > 0;
export const canRedo = (state: EditorState): boolean => state.future.length > 0;

const clampSelection = (selected: number | null, spec: ModelSpec): number | null =>
  selected === null || spec.parts.length === 0 ? null : Math.min(selected, spec.parts.length - 1);

/** Push the current spec onto the undo stack and move to `next`. */
function commit(state: EditorState, next: ModelSpec, selected: number | null): EditorState {
  return {
    ...state,
    spec: next,
    past: [...state.past, state.spec].slice(-HISTORY_LIMIT),
    future: [],
    selected: clampSelection(selected, next),
  };
}

const sameVec = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/** Does a patch change anything? A no-op must not spend an undo step. */
function changes(part: ModelPart, patch: PartPatch): boolean {
  return (Object.keys(patch) as (keyof PartPatch)[]).some((key) => {
    const next = patch[key];
    const current = part[key];
    if (next === undefined) return false;
    return Array.isArray(next) ? !sameVec(next, current as number[]) : next !== current;
  });
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load':
      return initialEditorState(action.spec, action.source);
    case 'select':
      return { ...state, selected: action.index === null ? null : clampSelection(action.index, state.spec) };
    case 'patch': {
      const part = state.spec.parts[action.index];
      if (!part || !changes(part, action.patch)) return state;
      const parts = state.spec.parts.map((p, i) => (i === action.index ? ({ ...p, ...action.patch } as ModelPart) : p));
      return commit(state, { ...state.spec, parts }, state.selected);
    }
    case 'remove': {
      if (!state.spec.parts[action.index] || state.spec.parts.length <= 1) return state;
      const parts = state.spec.parts.filter((_, i) => i !== action.index);
      return commit(state, { ...state.spec, parts }, null);
    }
    case 'duplicate': {
      const part = state.spec.parts[action.index];
      if (!part) return state;
      const copy: ModelPart = { ...part, name: `${part.name} copy`, position: [part.position[0] + 0.2, part.position[1], part.position[2]] };
      const parts = [...state.spec.parts.slice(0, action.index + 1), copy, ...state.spec.parts.slice(action.index + 1)];
      return commit(state, { ...state.spec, parts }, action.index + 1);
    }
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        spec: previous,
        past: state.past.slice(0, -1),
        future: [state.spec, ...state.future],
        selected: clampSelection(state.selected, previous),
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        spec: next,
        past: [...state.past, state.spec],
        future: state.future.slice(1),
        selected: clampSelection(state.selected, next),
      };
    }
    case 'markSaved':
      return { ...state, saved: state.spec };
    case 'external': {
      if (state.source !== action.source) return state;
      const same = JSON.stringify(action.spec) === JSON.stringify(state.spec);
      const next = same ? state : commit(state, action.spec, state.selected);
      return action.saved ? { ...next, saved: next.spec } : next;
    }
  }
}

/** Round a gizmo's float noise (`0.30000000000000004`) away so saved JSON stays readable. */
export const tidy = (value: number): number => Math.round(value * 10000) / 10000;
export const tidyVec = (v: readonly number[]): Vec3 => [tidy(v[0]!), tidy(v[1]!), tidy(v[2]!)];
