import { describe, expect, it } from 'vitest';

import { buildScene } from '../model-geometry/scene';
import { BUILT_IN_FOLIAGE_DESIGNS, builtInFoliageDesign, DEFAULT_FOLIAGE_ASSETS, foliageGeometry } from './foliage-designs';

describe('foliage-designs', () => {
  const designs = ['pine', 'broadleaf', 'birch', 'bush', 'grass-clump', 'rock'];

  for (const name of designs) {
    it(`builds ${name} under 300 triangles`, () => {
      const spec = BUILT_IN_FOLIAGE_DESIGNS[name];
      expect(spec).toBeDefined();
      const parts = buildScene(spec!);
      expect(parts.length).toBeGreaterThan(0);
      let totalTriangles = 0;
      for (const part of parts) {
        totalTriangles += part.indices.length / 3;
      }
      expect(totalTriangles).toBeLessThanOrEqual(300);
      expect(totalTriangles).toBeGreaterThan(0);
    });
  }

  it('supports oak and grass-tuft aliases', () => {
    expect(BUILT_IN_FOLIAGE_DESIGNS.oak).toBe(BUILT_IN_FOLIAGE_DESIGNS.broadleaf);
    expect(BUILT_IN_FOLIAGE_DESIGNS['grass-tuft']).toBe(BUILT_IN_FOLIAGE_DESIGNS['grass-clump']);
  });

  it('merges a design into one vertex-coloured geometry', () => {
    const geo = foliageGeometry(BUILT_IN_FOLIAGE_DESIGNS.pine!);
    expect(geo.positions.length).toBe(geo.colors.length);
    expect(geo.normals.length).toBe(geo.positions.length);
    expect(Math.max(...geo.indices)).toBe(geo.positions.length / 3 - 1);
  });

  it('resolves every default asset to a built-in design, and a library path to none', () => {
    for (const id of [...DEFAULT_FOLIAGE_ASSETS.tree, ...DEFAULT_FOLIAGE_ASSETS.grass]) expect(builtInFoliageDesign(id)).toBeDefined();
    expect(builtInFoliageDesign('trees/oak-big')).toBeUndefined();
    expect(builtInFoliageDesign('toString')).toBeUndefined();
  });
});
