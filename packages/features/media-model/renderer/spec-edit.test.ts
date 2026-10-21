import { applyPoint, ModelSpecSchema, worldMatrices, type ModelPartInput, type ModelSpec } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { buildOutline, rangeBetween } from './outliner';
import {
  alignParts,
  anchorPosition,
  copyParts,
  distributeParts,
  duplicateParts,
  editModifiers,
  ensureIds,
  groupParts,
  mirrorParts,
  partBoxes,
  pasteParts,
  patchMaterial,
  removeParts,
  reparent,
  subtractSelection,
  topMost,
  ungroupParts,
  defaultModifier,
} from './spec-edit';

const make = (...parts: ModelPartInput[]): ModelSpec => ensureIds(ModelSpecSchema.parse({ name: 't', parts }));
const box = (extra: Partial<ModelPartInput> = {}): ModelPartInput => ({ shape: 'box', size: [1, 1, 1], ...extra }) as ModelPartInput;
const world = (spec: ModelSpec, i: number) => applyPoint(worldMatrices(spec.parts)[i]!, [0, 0, 0]);
const close = (actual: readonly number[], expected: readonly number[]) => expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 3));

describe('ids', () => {
  it('assigns missing and repeated ids and rewrites name references to ids', () => {
    const spec = ensureIds(ModelSpecSchema.parse({ parts: [{ name: 'g', shape: 'group' }, { name: 'k', shape: 'box', size: [1, 1, 1], parent: 'g' }] }));
    expect(spec.parts.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(spec.parts[1]!.parent).toBe('p1');
  });
});

describe('grouping', () => {
  it('groups at the centre without moving anything, and ungroup restores', () => {
    const spec = make(box({ position: [0, 0, 0] }), box({ position: [4, 2, 0] }));
    const grouped = groupParts(spec, [0, 1])!;
    expect(grouped.spec.parts[0]!.shape).toBe('group');
    close(anchorPosition(grouped.spec, 0), [2, 1, 0]);
    close(world(grouped.spec, 1), [0, 0, 0]);
    close(world(grouped.spec, 2), [4, 2, 0]);
    expect(grouped.select).toEqual([0]);
    const back = ungroupParts(grouped.spec, [0])!;
    expect(back.spec.parts.map((p) => p.shape)).toEqual(['box', 'box']);
    close(world(back.spec, 1), [4, 2, 0]);
    expect(back.spec.parts.every((p) => !p.parent)).toBe(true);
  });

  it('a group keeps rotated children where they were', () => {
    const spec = make({ shape: 'group', id: 'g', rotation: [0, 90, 0], position: [1, 0, 0] }, box({ parent: 'g', position: [0, 0, 2] }));
    const before = world(spec, 1);
    const free = reparent(spec, 1, null)!;
    close(world(free.spec, 1), before);
    const again = reparent(free.spec, 1, 0)!;
    close(world(again.spec, 1), before);
  });

  it('refuses to parent a part under itself or its own descendant', () => {
    const spec = make({ shape: 'group', id: 'a' }, { shape: 'group', id: 'b', parent: 'a' }, box({ parent: 'b' }));
    expect(reparent(spec, 0, 2)).toBeNull();
    expect(reparent(spec, 0, 1)).toBeNull();
    expect(reparent(spec, 0, 0)).toBeNull();
    expect(reparent(spec, 2, 0)).not.toBeNull();
  });

  it('removing a group moves its children up and keeps their world positions', () => {
    const spec = make({ shape: 'group', id: 'g', position: [5, 0, 0] }, box({ parent: 'g', position: [1, 0, 0] }));
    const removed = removeParts(spec, [0])!;
    expect(removed.spec.parts).toHaveLength(1);
    expect(removed.spec.parts[0]!.parent).toBeUndefined();
    close(world(removed.spec, 0), [6, 0, 0]);
  });

  it('never removes everything', () => {
    expect(removeParts(make(box()), [0])).toBeNull();
  });

  it('topMost drops selected descendants', () => {
    const spec = make({ shape: 'group', id: 'g' }, box({ parent: 'g' }), box());
    expect(topMost(spec, [0, 1, 2])).toEqual([0, 2]);
  });
});

describe('copies', () => {
  it('duplicates a group subtree with fresh ids and remapped parents', () => {
    const spec = make({ shape: 'group', id: 'g', name: 'Group' }, box({ parent: 'g', name: 'kid' }));
    const copy = duplicateParts(spec, [0])!;
    expect(copy.spec.parts).toHaveLength(4);
    const ids = copy.spec.parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(4);
    const kid = copy.spec.parts[3]!;
    expect(kid.parent).toBe(copy.spec.parts[2]!.id);
    expect(copy.spec.parts[2]!.name).toBe('Group copy');
    expect(copy.select).toEqual([2]);
  });

  it('keeps a copied boolean tool pointing at its copied target', () => {
    const spec = make({ shape: 'group', id: 'g' }, box({ id: 'b', parent: 'g' }), { shape: 'sphere', radius: 1, parent: 'g', op: 'subtract', target: 'b' });
    const copy = duplicateParts(spec, [0])!;
    const tool = copy.spec.parts.at(-1)!;
    expect(tool.target).toBe(copy.spec.parts[copy.spec.parts.length - 2]!.id);
  });

  it('copy/paste bakes world transforms and pastes offset with new ids', () => {
    const spec = make({ shape: 'group', id: 'g', position: [3, 0, 0] }, box({ parent: 'g', position: [1, 0, 0] }));
    const clip = copyParts(spec, [1])!;
    expect(clip[0]!.parent).toBeUndefined();
    close(clip[0]!.position, [4, 0, 0]);
    const pasted = pasteParts(spec, clip, 1)!;
    expect(pasted.spec.parts).toHaveLength(3);
    expect(pasted.spec.parts[2]!.id).not.toBe(spec.parts[1]!.id);
    close(pasted.spec.parts[2]!.position, [4.2, 0, 0]);
    expect(pasted.select).toEqual([2]);
  });
});

describe('align, distribute, mirror', () => {
  const row = () => make(box({ position: [0, 0, 0] }), box({ position: [5, 0, 0], size: [2, 2, 2] }), box({ position: [20, 0, 0] }));

  it('aligns minimums on an axis', () => {
    const next = alignParts(row(), [0, 1, 2], 'x', 'min')!;
    const boxes = partBoxes(next.spec);
    expect(boxes.map((b) => b!.min[0])).toEqual([-0.5, -0.5, -0.5].map((n) => expect.closeTo(n, 4)));
  });

  it('aligns centres and maxima', () => {
    const centred = alignParts(make(box({ position: [0, 3, 0] }), box({ position: [5, 0, 0] })), [0, 1], 'y', 'center');
    expect(centred).not.toBeNull();
    const maxed = alignParts(row(), [0, 1, 2], 'x', 'max')!;
    expect(partBoxes(maxed.spec).map((b) => b!.max[0])).toEqual([20.5, 20.5, 20.5].map((n) => expect.closeTo(n, 4)));
  });

  it('needs two parts to align and three to distribute', () => {
    expect(alignParts(row(), [0], 'x', 'min')).toBeNull();
    expect(distributeParts(row(), [0, 1], 'x')).toBeNull();
  });

  it('distributes with equal gaps', () => {
    const next = distributeParts(row(), [0, 1, 2], 'x')!;
    const boxes = partBoxes(next.spec).map((b) => b!);
    const gap1 = boxes[1]!.min[0]! - boxes[0]!.max[0]!;
    const gap2 = boxes[2]!.min[0]! - boxes[1]!.max[0]!;
    expect(gap1).toBeCloseTo(gap2, 3);
    expect(boxes[0]!.min[0]).toBeCloseTo(-0.5, 3);
    expect(boxes[2]!.max[0]).toBeCloseTo(20.5, 3);
  });

  it('mirrors across the world origin plane with a true reflection (negative scale)', () => {
    const spec = make({ shape: 'wedge', size: [1, 1, 1], position: [3, 1, 0] });
    const next = mirrorParts(spec, [0], 'x', 'origin', false)!;
    close(next.spec.parts[0]!.position, [-3, 1, 0]);
    expect(next.spec.parts[0]!.scale[0]).toBeLessThan(0);
    const box0 = partBoxes(next.spec)[0]!;
    expect(box0.max[0]).toBeCloseTo(-2.5, 3);
  });

  it('mirror copy keeps the original and selects the reflection; centre mirror is a flip in place', () => {
    const spec = make(box({ position: [3, 0, 0] }));
    const copy = mirrorParts(spec, [0], 'x', 'origin', true)!;
    expect(copy.spec.parts).toHaveLength(2);
    close(copy.spec.parts[0]!.position, [3, 0, 0]);
    close(copy.spec.parts[1]!.position, [-3, 0, 0]);
    expect(copy.select).toEqual([1]);
    const flip = mirrorParts(spec, [0], 'x', 'centre', false)!;
    close(flip.spec.parts[0]!.position, [3, 0, 0]);
  });
});

describe('booleans, modifiers, materials', () => {
  it('subtract selection: first is the target, last is the tool', () => {
    const spec = make(box({ id: 'blk' }), { shape: 'sphere', radius: 0.5 });
    const next = subtractSelection(spec, [0, 1])!;
    expect(next.spec.parts[1]).toMatchObject({ op: 'subtract', target: 'blk' });
    expect(subtractSelection(spec, [0])).toBeNull();
  });

  it('adds, reorders, toggles, updates and removes modifiers', () => {
    let spec = make(box());
    spec = editModifiers(spec, 0, { kind: 'add', modifier: defaultModifier('bevel') })!.spec;
    spec = editModifiers(spec, 0, { kind: 'add', modifier: defaultModifier('subdivide') })!.spec;
    expect(spec.parts[0]!.modifiers!.map((m) => m.type)).toEqual(['bevel', 'subdivide']);
    spec = editModifiers(spec, 0, { kind: 'move', at: 1, to: 0 })!.spec;
    expect(spec.parts[0]!.modifiers!.map((m) => m.type)).toEqual(['subdivide', 'bevel']);
    spec = editModifiers(spec, 0, { kind: 'toggle', at: 0 })!.spec;
    expect(spec.parts[0]!.modifiers![0]!.enabled).toBe(false);
    spec = editModifiers(spec, 0, { kind: 'update', at: 1, patch: { amount: 0.2 } })!.spec;
    expect(spec.parts[0]!.modifiers![1]).toMatchObject({ type: 'bevel', amount: 0.2 });
    spec = editModifiers(spec, 0, { kind: 'remove', at: 0 })!.spec;
    spec = editModifiers(spec, 0, { kind: 'remove', at: 0 })!.spec;
    expect(spec.parts[0]).not.toHaveProperty('modifiers');
    expect(editModifiers(spec, 0, { kind: 'move', at: 0, to: 3 })).toBeNull();
  });

  it('every modifier default validates against the schema', () => {
    for (const type of ['bevel', 'subdivide', 'mirror', 'array', 'radialArray', 'twist', 'taper', 'bend'] as const) {
      expect(() => ModelSpecSchema.parse({ parts: [{ shape: 'box', size: [1, 1, 1], modifiers: [defaultModifier(type)] }] })).not.toThrow();
    }
  });

  it('patches material fields and drops cleared ones', () => {
    let spec = make(box());
    spec = patchMaterial(spec, [0], { metalness: 1, roughness: 0.3 })!.spec;
    expect(spec.parts[0]!.material).toEqual({ metalness: 1, roughness: 0.3 });
    spec = patchMaterial(spec, [0], { metalness: undefined, roughness: undefined })!.spec;
    expect(spec.parts[0]).not.toHaveProperty('material');
    expect(patchMaterial(spec, [0], { metalness: undefined })).toBeNull();
  });
});

describe('outliner', () => {
  const spec = make({ shape: 'group', id: 'g' }, box({ parent: 'g', hidden: true }), box(), { shape: 'group', id: 'h', parent: 'g' }, box({ parent: 'h' }));

  it('lists rows in tree order with depth, children flags and inherited hiding', () => {
    const rows = buildOutline(spec);
    expect(rows.map((r) => [r.index, r.depth])).toEqual([[0, 0], [1, 1], [3, 1], [4, 2], [2, 0]]);
    expect(rows[0]!.hasChildren).toBe(true);
    expect(rows[1]!.hidden).toBe(true);
    expect(rows[3]!.hidden).toBe(false);
  });

  it('leaves out the children of a collapsed part', () => {
    const rows = buildOutline(spec, new Set(['g']));
    expect(rows.map((r) => r.index)).toEqual([0, 2]);
    expect(rows[0]!.collapsed).toBe(true);
  });

  it('range selection follows outline order', () => {
    const rows = buildOutline(spec);
    expect(rangeBetween(rows, 1, 4)).toEqual([1, 3, 4]);
    expect(rangeBetween(rows, 2, 3)).toEqual([3, 4, 2]);
  });
});
