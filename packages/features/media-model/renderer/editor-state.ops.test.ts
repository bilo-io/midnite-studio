import { identity, ModelSpecSchema, translation } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { canUndo, editorReducer, initialEditorState, movableSelection, type EditorAction, type EditorState } from './editor-state';
import { lightingById, LIGHTING_PRESETS } from './lighting';
import { SHORTCUTS } from './shortcuts';
import { ANGLE_STEPS, effectiveStep, GRID_STEPS, nudgeDistance, snapValue, snapVec, stepAlong } from './snap';

const spec = ModelSpecSchema.parse({
  name: 'rig',
  parts: [
    { name: 'a', shape: 'box', size: [1, 1, 1] },
    { name: 'b', shape: 'sphere', radius: 1, position: [4, 0, 0] },
    { name: 'c', shape: 'cone', radius: 1, height: 2, position: [8, 0, 0] },
  ],
});
const run = (state: EditorState, ...actions: EditorAction[]): EditorState => actions.reduce(editorReducer, state);
const fresh = () => initialEditorState(spec);

describe('multi-select', () => {
  it('toggles, selects many, selects all, keeps the last pick primary', () => {
    const s = run(fresh(), { type: 'select', index: 0 }, { type: 'toggleSelect', index: 2 }, { type: 'toggleSelect', index: 1 });
    expect(s.selection).toEqual([0, 2, 1]);
    expect(s.selected).toBe(1);
    expect(run(s, { type: 'toggleSelect', index: 1 }).selected).toBe(2);
    expect(run(fresh(), { type: 'selectAll' }).selection).toEqual([0, 1, 2]);
    expect(run(fresh(), { type: 'selectMany', indices: [2, 9, 0] }).selection).toEqual([2, 0]);
    expect(run(s, { type: 'select', index: null }).selection).toEqual([]);
  });
});

describe('structural edits are single undo steps', () => {
  it('groups the selection, selects the group, and undoes in one step', () => {
    const grouped = run(fresh(), { type: 'selectMany', indices: [0, 1] }, { type: 'group' });
    expect(grouped.spec.parts[0]!.shape).toBe('group');
    expect(grouped.selection).toEqual([0]);
    expect(grouped.past).toHaveLength(1);
    const back = run(grouped, { type: 'undo' });
    expect(back.spec).toBe(spec);
  });

  it('ungroups', () => {
    const s = run(fresh(), { type: 'selectMany', indices: [0, 1] }, { type: 'group' }, { type: 'ungroup' });
    expect(s.spec.parts.map((p) => p.shape)).toEqual(['box', 'sphere', 'cone']);
    expect(s.selection).toEqual([0, 1]);
  });

  it('removes many, duplicates many, reparents and reorders', () => {
    expect(run(fresh(), { type: 'selectMany', indices: [0, 2] }, { type: 'remove' }).spec.parts.map((p) => p.name)).toEqual(['b']);
    const dup = run(fresh(), { type: 'selectMany', indices: [0, 1] }, { type: 'duplicate' });
    expect(dup.spec.parts).toHaveLength(5);
    expect(dup.selection).toHaveLength(2);
    const grouped = run(fresh(), { type: 'select', index: 0 }, { type: 'group' });
    const re = run(grouped, { type: 'reparent', index: 3, parent: 0 });
    expect(re.spec.parts[3]!.parent).toBe(grouped.spec.parts[0]!.id);
    const refused = run(re, { type: 'reparent', index: 0, parent: 3 });
    expect(refused).toBe(re);
    expect(run(fresh(), { type: 'move', from: 0, to: 2 }).spec.parts.map((p) => p.name)).toEqual(['b', 'c', 'a']);
  });

  it('copies and pastes without touching history on copy', () => {
    const copied = run(fresh(), { type: 'select', index: 1 }, { type: 'copy' });
    expect(copied.clipboard).toHaveLength(1);
    expect(canUndo(copied)).toBe(false);
    const pasted = run(copied, { type: 'paste' }, { type: 'paste' });
    expect(pasted.spec.parts).toHaveLength(5);
    expect(pasted.spec.parts[4]!.position[0]).toBeCloseTo(4.4, 3);
    expect(run(fresh(), { type: 'paste' })).toEqual(fresh());
  });

  it('aligns, distributes, mirrors, subtracts', () => {
    const base = run(fresh(), { type: 'selectAll' });
    const aligned = run(base, { type: 'align', axis: 'x', mode: 'min' });
    expect(aligned.spec.parts.map((p) => p.position[0])).not.toEqual(spec.parts.map((p) => p.position[0]));
    expect(run(base, { type: 'distribute', axis: 'x' }).spec).not.toBe(base.spec);
    expect(run(fresh(), { type: 'select', index: 1 }, { type: 'mirror', axis: 'x', about: 'origin' }).spec.parts[1]!.position[0]).toBeCloseTo(-4, 3);
    const sub = run(fresh(), { type: 'selectMany', indices: [0, 1] }, { type: 'subtract' });
    expect(sub.spec.parts[1]).toMatchObject({ op: 'subtract' });
    expect(sub.spec.parts[1]!.target).toBe(sub.spec.parts[0]!.id);
  });

  it('edits modifiers, materials and visibility', () => {
    let s = run(fresh(), { type: 'select', index: 0 }, { type: 'addModifier', index: 0, modifier: { type: 'bevel', amount: 0.1 } });
    expect(s.spec.parts[0]!.modifiers).toHaveLength(1);
    s = run(s, { type: 'modifier', index: 0, edit: { kind: 'toggle', at: 0 } }, { type: 'material', patch: { metalness: 0.9 } });
    expect(s.spec.parts[0]!.modifiers![0]!.enabled).toBe(false);
    expect(s.spec.parts[0]!.material).toEqual({ metalness: 0.9 });
    s = run(s, { type: 'patchMany', indices: [0, 1], patch: { hidden: true } });
    expect(s.spec.parts.map((p) => p.hidden)).toEqual([true, true, undefined]);
    expect(run(s, { type: 'showAll' }).spec.parts.every((p) => !p.hidden)).toBe(true);
  });

  it('a gizmo commit sets world anchors, and nudges move in world space', () => {
    const s = run(fresh(), { type: 'transform', items: [{ index: 1, anchor: translation([0, 2, 0]) }] });
    expect(s.spec.parts[1]!.position).toEqual([0, 2, 0]);
    expect(run(fresh(), { type: 'transform', items: [{ index: 0, anchor: identity() }] })).toEqual(fresh());
    const n = run(fresh(), { type: 'select', index: 0 }, { type: 'nudge', delta: [0.5, 0, 0] });
    expect(n.spec.parts[0]!.position[0]).toBeCloseTo(0.5, 4);
  });

  it('only top-most unlocked parts drag', () => {
    const s = run(fresh(), { type: 'select', index: 0 }, { type: 'group' }, { type: 'selectAll' });
    expect(movableSelection(s)).toEqual([0, 2, 3]);
    const locked = run(s, { type: 'patch', index: 2, patch: { locked: true } });
    expect(movableSelection(locked)).toEqual([0, 3]);
  });
});

describe('snapping maths', () => {
  it('snaps to a step and leaves a zero step alone', () => {
    expect(snapValue(0.237, 0.1)).toBeCloseTo(0.2, 6);
    expect(snapValue(-0.26, 0.25)).toBeCloseTo(-0.25, 6);
    expect(snapValue(1.234, 0)).toBe(1.234);
    expect(snapVec([0.04, 0.06, -0.06], 0.05)).toEqual([0.05, 0.05, -0.05]);
  });

  it('steps along the lists, clamped, and flips with shift', () => {
    expect(stepAlong(GRID_STEPS, 0.1, 1)).toBe(0.25);
    expect(stepAlong(GRID_STEPS, 0.1, -1)).toBe(0.05);
    expect(stepAlong(GRID_STEPS, 1, 1)).toBe(1);
    expect(stepAlong(ANGLE_STEPS, 0, -1)).toBe(0);
    expect(effectiveStep(0.1, true, 0.1)).toBe(0);
    expect(effectiveStep(0, true, 0.1)).toBe(0.1);
    expect(effectiveStep(0.5, false, 0.1)).toBe(0.5);
    expect(nudgeDistance(0.25, true)).toBe(2.5);
    expect(nudgeDistance(0, false)).toBe(0.1);
  });
});

describe('shortcut and lighting tables', () => {
  it('has no duplicate chords', () => {
    const chords = SHORTCUTS.map((s) => s.chord.toLowerCase());
    expect(new Set(chords).size).toBe(chords.length);
  });

  it('every lighting preset is local data and the default resolves', () => {
    expect(LIGHTING_PRESETS.length).toBeGreaterThanOrEqual(5);
    expect(lightingById('nope').id).toBe('studio');
    expect(JSON.stringify(LIGHTING_PRESETS)).not.toMatch(/https?:|\.hdr/);
  });
});
