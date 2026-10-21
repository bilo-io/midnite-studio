import { MODEL_MAX_PARTS, ModelSpecSchema, type ModelPatchOp } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { applyPatchOps, describeEdit, ensurePartIds, validateDesign } from './spec-ops';

const spec = (parts: unknown[]) => ModelSpecSchema.parse({ name: 't', parts });
const box = (name: string, extra: Record<string, unknown> = {}) => ({ name, shape: 'box', size: [1, 1, 1], ...extra });

describe('ensurePartIds', () => {
  it('assigns ids to parts without one and keeps the ones present', () => {
    const out = ensurePartIds(spec([box('a'), box('b', { id: 'keep' }), box('c')]));
    expect(out.parts.map((p) => p.id)).toEqual(['p1', 'keep', 'p3']);
  });

  it('renames a repeated id — an editor duplicate copies it', () => {
    const out = ensurePartIds(spec([box('a', { id: 'x' }), box('a copy', { id: 'x' })]));
    const ids = out.parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe('x');
  });
});

describe('validateDesign', () => {
  it('forgives the aliases a model reaches for, then ids every part', () => {
    const result = validateDesign({ parts: [{ type: 'cube', size: 2, colour: 'red', pos: [0, 1, 0] }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.parts[0]).toMatchObject({ shape: 'box', size: [2, 2, 2], color: '#cc3333', id: 'p1' });
    }
  });

  it('returns structured issues with paths instead of throwing', () => {
    const result = validateDesign({ parts: [{ shape: 'sphere' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatchObject({ path: 'parts.0.radius' });
      expect(result.errors[0]!.message).toBeTruthy();
    }
  });

  it('rejects a non-object and an over-cap design', () => {
    expect(validateDesign('nope').ok).toBe(false);
    const tooMany = validateDesign({ parts: Array.from({ length: MODEL_MAX_PARTS + 1 }, () => box('x')) });
    expect(tooMany.ok).toBe(false);
  });
});

describe('applyPatchOps', () => {
  const base = () => ensurePartIds(spec([box('a'), box('b'), box('c')]));

  it('adds, updates and removes by id in one call', () => {
    const ops: ModelPatchOp[] = [
      { op: 'remove', id: 'p2' },
      { op: 'update', id: 'p1', fields: { color: '#00ff00', position: [1, 2, 3] } },
      { op: 'add', part: { name: 'ball', shape: 'sphere', radius: 0.5 }, index: 0 },
    ];
    const result = applyPatchOps(base(), ops);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.parts.map((p) => p.name)).toEqual(['ball', 'a', 'c']);
    expect(result.spec.parts[1]).toMatchObject({ id: 'p1', color: '#00ff00', position: [1, 2, 3] });
    expect(result.spec.parts[0]!.id).toMatch(/^p\d+$/);
    // The new id never collides with an existing one.
    expect(new Set(result.spec.parts.map((p) => p.id)).size).toBe(3);
  });

  it('is all or nothing: one bad op rejects the call with its index and the original is untouched', () => {
    const original = base();
    const result = applyPatchOps(original, [
      { op: 'update', id: 'p1', fields: { color: '#ff0000' } },
      { op: 'update', id: 'p3', fields: { size: [-1, 1, 1] } },
      { op: 'remove', id: 'nope' },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.opIndex)).toEqual([1, 2]);
    expect(result.errors[0]!.path).toContain('size');
    expect(result.errors[1]!.message).toContain('Ids: p1, p2, p3');
    expect(original.parts[0]!.color).toBe('#b0b0b0');
  });

  it('is generic over part fields: a shape change is validated against the new shape', () => {
    const toSphere = applyPatchOps(base(), [{ op: 'update', id: 'p1', fields: { shape: 'sphere', radius: 2 } }]);
    // `size` is simply not a sphere field, so the merged part still parses and the stale key is dropped by the schema.
    expect(toSphere.ok).toBe(true);
    const missing = applyPatchOps(base(), [{ op: 'update', id: 'p1', fields: { shape: 'cylinder' } }]);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.map((e) => e.path).join(' ')).toContain('radiusTop');
  });

  it('clears a field back to its default with null, and refuses to change an id', () => {
    const cleared = applyPatchOps(
      ensurePartIds(spec([box('a', { color: '#112233' })])),
      [{ op: 'update', id: 'p1', fields: { color: null } }],
    );
    expect(cleared.ok && cleared.spec.parts[0]!.color).toBe('#b0b0b0');
    const renamed = applyPatchOps(base(), [{ op: 'update', id: 'p1', fields: { id: 'zzz' } }]);
    expect(renamed.ok).toBe(false);
  });

  it('refuses an explicit id that is taken, an empty design, and going over the cap', () => {
    expect(applyPatchOps(base(), [{ op: 'add', part: { ...box('dup'), id: 'p1' } }]).ok).toBe(false);
    const empty = applyPatchOps(base(), [
      { op: 'remove', id: 'p1' },
      { op: 'remove', id: 'p2' },
      { op: 'remove', id: 'p3' },
    ]);
    expect(empty.ok).toBe(false);
    const full = ensurePartIds(spec(Array.from({ length: MODEL_MAX_PARTS }, (_, i) => box(`p${i}`))));
    const over = applyPatchOps(full, [{ op: 'add', part: box('one too many') }]);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.errors[0]!.message).toContain(String(MODEL_MAX_PARTS));
  });
});

describe('describeEdit', () => {
  it('reports counts, ids and the bounds of the built scene', () => {
    const info = describeEdit(ensurePartIds(spec([box('a', { position: [0, 0.5, 0] })])));
    expect(info.partCount).toBe(1);
    expect(info.parts).toEqual([{ id: 'p1', name: 'a', shape: 'box' }]);
    expect(info.bounds).toEqual({ min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], size: [1, 1, 1] });
  });
});
