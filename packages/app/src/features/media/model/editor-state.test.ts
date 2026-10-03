import { ModelSpecSchema } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { canRedo, canUndo, editorReducer, HISTORY_LIMIT, initialEditorState, isDirty, tidyVec, type EditorAction, type EditorState } from './editor-state';

const spec = ModelSpecSchema.parse({
  name: 'rig',
  parts: [
    { name: 'a', shape: 'box', size: [1, 1, 1] },
    { name: 'b', shape: 'sphere', radius: 1, position: [2, 0, 0] },
    { name: 'c', shape: 'cone', radius: 1, height: 2 },
  ],
});
const run = (state: EditorState, ...actions: EditorAction[]): EditorState => actions.reduce(editorReducer, state);
const fresh = () => initialEditorState(spec);

describe('selection', () => {
  it('selects, deselects and clamps', () => {
    expect(run(fresh(), { type: 'select', index: 1 }).selected).toBe(1);
    expect(run(fresh(), { type: 'select', index: 1 }, { type: 'select', index: null }).selected).toBeNull();
    expect(run(fresh(), { type: 'select', index: 99 }).selected).toBe(2);
  });
});

describe('patching', () => {
  it('moves a part as one undoable step and leaves the original untouched', () => {
    const next = run(fresh(), { type: 'patch', index: 0, patch: { position: [1, 2, 3] } });
    expect(next.spec.parts[0]!.position).toEqual([1, 2, 3]);
    expect(spec.parts[0]!.position).toEqual([0, 0, 0]);
    expect(next.past).toHaveLength(1);
    expect(isDirty(next)).toBe(true);
  });

  it('recolours and renames', () => {
    const next = run(fresh(), { type: 'patch', index: 1, patch: { color: '#ff0000', name: 'head' } });
    expect(next.spec.parts[1]).toMatchObject({ color: '#ff0000', name: 'head' });
  });

  it('ignores a patch that changes nothing, so it spends no undo step', () => {
    const same = run(fresh(), { type: 'patch', index: 1, patch: { position: [2, 0, 0], color: spec.parts[1]!.color } });
    expect(same).toEqual(fresh());
    expect(canUndo(same)).toBe(false);
  });

  it('ignores an unknown index', () => {
    expect(run(fresh(), { type: 'patch', index: 9, patch: { color: '#000000' } })).toEqual(fresh());
  });
});

describe('undo / redo', () => {
  const edited = run(fresh(), { type: 'patch', index: 0, patch: { color: '#111111' } }, { type: 'patch', index: 0, patch: { color: '#222222' } });

  it('walks back and forward through the history', () => {
    const back = run(edited, { type: 'undo' });
    expect(back.spec.parts[0]!.color).toBe('#111111');
    expect(canRedo(back)).toBe(true);
    const start = run(back, { type: 'undo' });
    expect(start.spec).toBe(spec);
    expect(canUndo(start)).toBe(false);
    expect(run(start, { type: 'redo' }, { type: 'redo' }).spec.parts[0]!.color).toBe('#222222');
  });

  it('is not dirty once undone back to the saved spec', () => {
    expect(isDirty(run(edited, { type: 'undo' }, { type: 'undo' }))).toBe(false);
  });

  it('drops the redo branch when a new edit follows an undo', () => {
    const branched = run(edited, { type: 'undo' }, { type: 'patch', index: 2, patch: { name: 'tip' } });
    expect(canRedo(branched)).toBe(false);
  });

  it('does nothing on an empty stack', () => {
    expect(run(fresh(), { type: 'undo' })).toEqual(fresh());
    expect(run(fresh(), { type: 'redo' })).toEqual(fresh());
  });

  it('caps the history', () => {
    let state = fresh();
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) state = editorReducer(state, { type: 'patch', index: 0, patch: { position: [i + 1, 0, 0] } });
    expect(state.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe('remove / duplicate', () => {
  it('removes a part, deselects, and can undo it back', () => {
    const removed = run(fresh(), { type: 'select', index: 1 }, { type: 'remove', index: 1 });
    expect(removed.spec.parts.map((p) => p.name)).toEqual(['a', 'c']);
    expect(removed.selected).toBeNull();
    expect(run(removed, { type: 'undo' }).spec.parts.map((p) => p.name)).toEqual(['a', 'b', 'c']);
  });

  it('never removes the last part (a design needs at least one)', () => {
    const one = initialEditorState({ ...spec, parts: [spec.parts[0]!] });
    expect(run(one, { type: 'remove', index: 0 })).toEqual(one);
  });

  it('duplicates beside the original and selects the copy', () => {
    const copied = run(fresh(), { type: 'duplicate', index: 1 });
    expect(copied.spec.parts.map((p) => p.name)).toEqual(['a', 'b', 'b copy', 'c']);
    expect(copied.spec.parts[2]!.position).toEqual([2.2, 0, 0]);
    expect(copied.selected).toBe(2);
  });
});

describe('saving and loading', () => {
  it('marks the current spec as saved without touching the history', () => {
    const saved = run(fresh(), { type: 'patch', index: 0, patch: { color: '#111111' } }, { type: 'markSaved' });
    expect(isDirty(saved)).toBe(false);
    expect(canUndo(saved)).toBe(true);
    expect(isDirty(run(saved, { type: 'undo' }))).toBe(true);
  });

  it('loading a new spec resets everything', () => {
    const loaded = run(fresh(), { type: 'select', index: 2 }, { type: 'patch', index: 0, patch: { color: '#111111' } }, { type: 'load', spec, source: 'a/b.obj' });
    expect(loaded).toEqual(initialEditorState(spec, 'a/b.obj'));
  });
});

describe('tidyVec', () => {
  it('trims float noise', () => {
    expect(tidyVec([0.30000000000000004, 1.00004, -0.00001])).toEqual([0.3, 1, -0]);
  });
});
