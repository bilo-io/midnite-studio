import { ModelSpecSchema } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { applyPatchOps, describeEdit, validateDesign } from './spec-ops';
import { parseSpec } from './spec-parse';

const parse = (parts: unknown[]) => parseSpec(JSON.stringify({ name: 'x', parts }));

describe('forgiving the bigger schema (one-shot small models)', () => {
  it('keeps old aliases working when the shape has no new-shape fields', () => {
    const out = parse([
      { type: 'tube', radius: 0.2, height: 1 },
      { type: 'prism', size: [1, 1, 1] },
      { type: 'ellipsoid', radius: 1 },
      { type: 'pipe', radius: 0.1, height: 2 },
    ]);
    expect(out.ok && out.spec.parts.map((p) => p.shape)).toEqual(['cylinder', 'box', 'sphere', 'cylinder']);
  });

  it('reads the new shapes under their common names', () => {
    const out = parse([
      { shape: 'pill', radius: 0.2, height: 1 },
      { shape: 'rounded box', size: 1, radius: 0.1 },
      { shape: 'ramp', size: [1, 1, 2] },
      { shape: 'ellipsoid', size: [2, 1, 1] },
      { shape: 'prism', radius: 1, height: 1, sides: '6' },
    ]);
    expect(out.ok && out.spec.parts.map((p) => p.shape)).toEqual(['capsule', 'roundedBox', 'wedge', 'ellipsoid', 'prism']);
  });

  it('folds flat PBR fields into material and understands boolean words', () => {
    const out = parse([
      { id: 'a', shape: 'box', size: 1, metalness: '0.9', roughness: 0.2, emissive: 'red', alpha: 0.5 },
      { shape: 'sphere', radius: 0.4, operation: 'difference', target: 'a' },
    ]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.spec.parts[0]).toMatchObject({ material: { metalness: 0.9, roughness: 0.2, emissive: '#cc3333', opacity: 0.5 } });
    expect(out.spec.parts[1]).toMatchObject({ op: 'subtract' });
  });

  it('normalises modifier names and numeric strings', () => {
    const out = parse([
      { shape: 'box', size: 1, modifiers: [{ type: 'Subdivision', levels: '2' }, { type: 'radial array', count: '5', radius: '2' }, { type: 'linear', count: 3, offset: 1 }] },
    ]);
    expect(out.ok && out.spec.parts[0]!.modifiers).toEqual([
      { type: 'subdivide', levels: 2 },
      { type: 'radialArray', count: 5, axis: 'y', radius: 2 },
      { type: 'array', count: 3, offset: [1, 0, 0] },
    ]);
  });

  it('sends a dangling reference back for repair, with the part path', () => {
    const out = parse([{ shape: 'box', size: 1, parent: 'nowhere' }]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('parts[0].parent');
  });

  it('old designs (no new fields) still parse unchanged', () => {
    const out = parse([{ shape: 'box', size: [1, 2, 3], position: [0, 1, 0], color: '#abc' }]);
    expect(out.ok).toBe(true);
    if (out.ok) expect(Object.keys(out.spec.parts[0]!).sort()).toEqual(['color', 'name', 'position', 'rotation', 'scale', 'shape', 'size']);
  });
});

describe('agent edits check links too', () => {
  it('model_set_spec rejects a loop and accepts a clean hierarchy', () => {
    expect(validateDesign({ parts: [{ id: 'a', shape: 'group', parent: 'b' }, { id: 'b', shape: 'group', parent: 'a' }] }).ok).toBe(false);
    expect(validateDesign({ parts: [{ id: 'g', shape: 'group' }, { shape: 'box', size: 1, parent: 'g' }] }).ok).toBe(true);
  });

  it('a patch that removes a referenced part is refused whole', () => {
    const spec = ModelSpecSchema.parse({ parts: [{ id: 'g', shape: 'group' }, { id: 'c', shape: 'box', size: [1, 1, 1], parent: 'g' }] });
    const out = applyPatchOps(spec, [{ op: 'remove', id: 'g' }]);
    expect(out.ok).toBe(false);
  });

  it('the generic patch expresses CSG, modifiers and materials without a dedicated tool', () => {
    const spec = ModelSpecSchema.parse({ parts: [{ id: 'b', shape: 'box', size: [1, 1, 1] }] });
    const out = applyPatchOps(spec, [
      { op: 'update', id: 'b', fields: { modifiers: [{ type: 'bevel', amount: 0.05 }], material: { metalness: 1 } } },
      { op: 'add', part: { id: 'h', shape: 'cylinder', radiusTop: 0.2, radiusBottom: 0.2, height: 2, op: 'subtract', target: 'b' } },
    ]);
    expect(out.ok && out.spec.parts.map((p) => p.id)).toEqual(['b', 'h']);
  });
});

describe('edit reports', () => {
  it('reports triangles, and warns when a boolean is too heavy to run', () => {
    const light = describeEdit(ModelSpecSchema.parse({ parts: [{ shape: 'box', size: [1, 1, 1] }] }));
    expect(light.triangles).toBe(12);
    expect(light.warnings).toBeUndefined();
    const heavy = describeEdit(
      ModelSpecSchema.parse({
        parts: [
          { shape: 'sphere', radius: 1, segments: 96 },
          { shape: 'sphere', radius: 1, segments: 96, position: [0.5, 0, 0], op: 'subtract' },
        ],
      }),
    );
    expect(heavy.warnings?.[0]?.message).toMatch(/boolean/);
  });
});
