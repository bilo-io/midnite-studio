import {
  applyClipOps,
  applyRigOps,
  copyClips,
  setAnatomy,
  type Mat4,
  type ModelAnatomy,
  type ModelClipOp,
  type ModelFacing,
  type ModelModifier,
  type ModelPart,
  type ModelRigOp,
  type ModelSpec,
  type RigEditOutcome,
} from '@midnite/studio-shared';

import {
  alignParts,
  copyParts,
  distributeParts,
  duplicateParts,
  editModifiers,
  ensureIds,
  groupParts,
  mirrorParts,
  moveIndex,
  nudgeParts,
  pasteParts,
  patchMaterial,
  patchParts,
  removeParts,
  reparent,
  setAnchor,
  subtractSelection,
  topMost,
  ungroupParts,
  type AlignMode,
  type Axis,
  type ModifierEdit,
  type PartPatch,
  type Result,
} from './spec-edit';

/**
 * The model editor's document state — pure, so undo/redo, selection and every structural edit are
 * unit-tested without a canvas. The document is the `ModelSpec` itself: every edit (a gizmo drag, a
 * colour, a typed number, a group, an align) is one history step, and Save/Export hand that same
 * spec to main. The actual edits live in `spec-edit.ts`; this reducer adds selection, history and
 * the clipboard.
 */
export const HISTORY_LIMIT = 100;

export { tidy, tidyVec, type PartPatch } from './spec-edit';
export type Vec3 = [number, number, number];

export type EditorState = {
  spec: ModelSpec;
  /** The spec as last saved (or loaded) — `dirty` is "not this one". */
  saved: ModelSpec;
  past: ModelSpec[];
  future: ModelSpec[];
  /** The primary selection: the last part picked, what the inspector shows. */
  selected: number | null;
  /** Every selected part, in pick order (the primary is the last). */
  selection: number[];
  /** Which file the document came from — the editor shows only once this matches the selection. */
  source: string;
  /** Copied parts (subtrees, roots baked to world space); not part of the history. */
  clipboard: ModelPart[] | null;
  pastes: number;
};

export type EditorAction =
  | { type: 'load'; spec: ModelSpec; source: string }
  | { type: 'select'; index: number | null }
  | { type: 'selectMany'; indices: number[] }
  | { type: 'toggleSelect'; index: number }
  | { type: 'selectAll' }
  | { type: 'patch'; index: number; patch: PartPatch }
  | { type: 'patchMany'; indices: number[]; patch: PartPatch }
  | { type: 'material'; indices?: number[]; patch: Record<string, unknown>; color?: string }
  | { type: 'remove'; index?: number; indices?: number[] }
  | { type: 'duplicate'; index?: number; indices?: number[] }
  | { type: 'group'; indices?: number[] }
  | { type: 'ungroup'; indices?: number[] }
  | { type: 'reparent'; index: number; parent: number | null }
  | { type: 'move'; from: number; to: number }
  | { type: 'copy' }
  | { type: 'paste' }
  | { type: 'align'; axis: Axis; mode: AlignMode }
  | { type: 'distribute'; axis: Axis }
  | { type: 'mirror'; axis: Axis; about: 'origin' | 'centre'; copy?: boolean }
  | { type: 'subtract' }
  | { type: 'modifier'; index: number; edit: ModifierEdit }
  | { type: 'addModifier'; index: number; modifier: ModelModifier }
  | { type: 'nudge'; delta: Vec3 }
  /** A gizmo drag finished: set each part's world anchor in one step. */
  | { type: 'transform'; items: { index: number; anchor: Mat4 }[] }
  | { type: 'showAll' }
  /** Set the anatomy and place a fresh rig (`static` removes rig and clips) — the Rig tab's Auto-rig. */
  | { type: 'anatomy'; anatomy: ModelAnatomy; facing?: ModelFacing }
  /** Bone, binding, facing and falloff edits (the shared `applyRigOps`). */
  | { type: 'rig'; ops: ModelRigOp[] }
  /** Clip and pose-key edits (the shared `applyClipOps`). */
  | { type: 'clips'; ops: ModelClipOp[] }
  /** Copy another model's clips onto this rig. */
  | { type: 'retarget'; from: ModelSpec; replace?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'markSaved' }
  /** An agent edited this model: adopt its design as one undoable step; `saved` when the files match it. */
  | { type: 'external'; spec: ModelSpec; source: string; saved: boolean };

export const initialEditorState = (spec: ModelSpec, source = ''): EditorState => ({
  spec,
  saved: spec,
  past: [],
  future: [],
  selected: null,
  selection: [],
  source,
  clipboard: null,
  pastes: 0,
});

export const isDirty = (state: EditorState): boolean => state.spec !== state.saved;
export const canUndo = (state: EditorState): boolean => state.past.length > 0;
export const canRedo = (state: EditorState): boolean => state.future.length > 0;

const clampList = (list: readonly number[], spec: ModelSpec): number[] => [...new Set(list)].filter((i) => i >= 0 && i < spec.parts.length);

function withSelection(state: EditorState, list: readonly number[], spec: ModelSpec = state.spec): EditorState {
  const selection = clampList(list, spec);
  return { ...state, selection, selected: selection.length > 0 ? selection[selection.length - 1]! : null };
}

/** Push the current spec onto the undo stack and move to `next`. */
function commit(state: EditorState, next: ModelSpec, selection: readonly number[]): EditorState {
  return withSelection(
    { ...state, spec: next, past: [...state.past, state.spec].slice(-HISTORY_LIMIT), future: [] },
    selection,
    next,
  );
}

/** Run an edit on the id-complete spec; a refused or no-op edit leaves the state untouched. */
function apply(state: EditorState, edit: (spec: ModelSpec) => Result, keepSelection = true): EditorState {
  const base = ensureIds(state.spec);
  const result = edit(base);
  if (!result) return state;
  return commit(state, result.spec, result.select ?? (keepSelection ? state.selection : []));
}

/** A kernel rig edit as one history step; a refused or no-op edit leaves the state untouched. */
function applyRig(state: EditorState, edit: (spec: ModelSpec) => RigEditOutcome): EditorState {
  const out = edit(ensureIds(state.spec));
  if (!out.ok || JSON.stringify(out.spec) === JSON.stringify(state.spec)) return state;
  return commit(state, out.spec, state.selection);
}

const targetsOf = (state: EditorState, explicit?: number[], single?: number): number[] =>
  explicit ?? (single !== undefined ? [single] : state.selection);

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load':
      return initialEditorState(action.spec, action.source);
    case 'select':
      return withSelection(state, action.index === null ? [] : [Math.min(action.index, state.spec.parts.length - 1)]);
    case 'selectMany':
      return withSelection(state, action.indices);
    case 'toggleSelect':
      return withSelection(
        state,
        state.selection.includes(action.index) ? state.selection.filter((i) => i !== action.index) : [...state.selection, action.index],
      );
    case 'selectAll':
      return withSelection(
        state,
        state.spec.parts.map((_, i) => i),
      );
    case 'patch': {
      const result = patchParts(state.spec, [action.index], action.patch);
      return result ? commit(state, result.spec, state.selection) : state;
    }
    case 'patchMany': {
      const result = patchParts(state.spec, action.indices, action.patch);
      return result ? commit(state, result.spec, state.selection) : state;
    }
    case 'material':
      return apply(state, (spec) => {
        const indices = targetsOf(state, action.indices);
        const material = patchMaterial(spec, indices, action.patch);
        const tinted = action.color ? patchParts(material?.spec ?? spec, indices, { color: action.color }) : null;
        return tinted ?? material;
      });
    case 'remove':
      return apply(state, (spec) => removeParts(spec, targetsOf(state, action.indices, action.index)), false);
    case 'duplicate':
      return apply(state, (spec) => duplicateParts(spec, targetsOf(state, action.indices, action.index)));
    case 'group':
      return apply(state, (spec) => groupParts(spec, targetsOf(state, action.indices)));
    case 'ungroup':
      return apply(state, (spec) => ungroupParts(spec, targetsOf(state, action.indices)));
    case 'reparent':
      return apply(state, (spec) => reparent(spec, action.index, action.parent));
    case 'move':
      return apply(state, (spec) => moveIndex(spec, action.from, action.to));
    case 'copy': {
      const clip = copyParts(ensureIds(state.spec), state.selection);
      return clip ? { ...state, clipboard: clip, pastes: 0 } : state;
    }
    case 'paste': {
      if (!state.clipboard) return state;
      const times = state.pastes + 1;
      const next = apply(state, (spec) => pasteParts(spec, state.clipboard!, times));
      return next === state ? state : { ...next, pastes: times };
    }
    case 'align':
      return apply(state, (spec) => alignParts(spec, state.selection, action.axis, action.mode));
    case 'distribute':
      return apply(state, (spec) => distributeParts(spec, state.selection, action.axis));
    case 'mirror':
      return apply(state, (spec) => mirrorParts(spec, state.selection, action.axis, action.about, action.copy === true));
    case 'subtract':
      return apply(state, (spec) => subtractSelection(spec, state.selection));
    case 'modifier':
      return apply(state, (spec) => editModifiers(spec, action.index, action.edit));
    case 'addModifier':
      return apply(state, (spec) => editModifiers(spec, action.index, { kind: 'add', modifier: action.modifier }));
    case 'nudge':
      return apply(state, (spec) => nudgeParts(spec, state.selection, action.delta));
    case 'transform':
      return apply(state, (spec) => {
        let next = spec;
        for (const item of action.items) if (next.parts[item.index]) next = setAnchor(next, item.index, item.anchor);
        return JSON.stringify(next) === JSON.stringify(spec) ? null : { spec: next };
      });
    case 'showAll': {
      const hidden = state.spec.parts.map((p, i) => (p.hidden ? i : -1)).filter((i) => i >= 0);
      const result = patchParts(state.spec, hidden, { hidden: undefined });
      return result ? commit(state, result.spec, state.selection) : state;
    }
    case 'anatomy':
      return applyRig(state, (spec) => setAnatomy(spec, action.anatomy, action.facing));
    case 'rig':
      return applyRig(state, (spec) => applyRigOps(spec, action.ops));
    case 'clips':
      return applyRig(state, (spec) => applyClipOps(spec, action.ops));
    case 'retarget':
      return applyRig(state, (spec) => copyClips(action.from, spec, action.replace === true));
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return withSelection({ ...state, spec: previous, past: state.past.slice(0, -1), future: [state.spec, ...state.future] }, state.selection, previous);
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return withSelection({ ...state, spec: next, past: [...state.past, state.spec], future: state.future.slice(1) }, state.selection, next);
    }
    case 'markSaved':
      return { ...state, saved: state.spec };
    case 'external': {
      if (state.source !== action.source) return state;
      const same = JSON.stringify(action.spec) === JSON.stringify(state.spec);
      const next = same ? state : commit(state, action.spec, state.selection);
      return action.saved ? { ...next, saved: next.spec } : next;
    }
  }
}

/** Selected parts that move on their own (a selected parent already carries its selected children). */
export const movableSelection = (state: EditorState): number[] =>
  topMost(ensureIds(state.spec), state.selection).filter((i) => !state.spec.parts[i]?.locked);
