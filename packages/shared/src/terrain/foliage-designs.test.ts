import { describe, expect, it } from 'vitest';

import { buildScene } from '../model-geometry/scene';
import { BUILT_IN_FOLIAGE_DESIGNS } from './foliage-designs';

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
});
