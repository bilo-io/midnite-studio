import { ModelSpecSchema, type ModelPartInput } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { editorScene, meshGeometry } from './spec-geometry';

const spec = (...parts: ModelPartInput[]) => ModelSpecSchema.parse({ parts });
const boundsOf = (input: ModelPartInput) => {
  const scene = editorScene(spec(input));
  const geometry = meshGeometry(scene.parts[0]!);
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  return { min: min.toArray(), max: max.toArray() };
};
const close = (actual: number[], expected: number[]) => actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 4));

describe('the editor builds the exported geometry', () => {
  it('places parts in world space (transform baked in)', () => {
    const { min, max } = boundsOf({ shape: 'box', size: [2, 4, 6], position: [10, 0, 0] });
    close(min, [9, -2, -3]);
    close(max, [11, 2, 3]);
  });

  it('builds the new primitives too', () => {
    close(boundsOf({ shape: 'capsule', radius: 0.5, height: 1 }).max, [0.5, 1, 0.5]);
    close(boundsOf({ shape: 'ellipsoid', radii: [1, 2, 3] }).max, [1, 2, 3]);
  });

  it('reports a boolean as one solid plus an operand ghost, and memoises per spec', () => {
    const s = spec({ shape: 'box', size: [2, 2, 2] }, { shape: 'sphere', radius: 0.8, position: [1, 1, 1], op: 'subtract' });
    const scene = editorScene(s);
    expect(scene.parts.map((p) => p.role)).toEqual(['solid', 'operand']);
    expect(scene.stats.parts).toBe(1);
    expect(editorScene(s)).toBe(scene);
  });

  it('surfaces reference problems as issues', () => {
    const scene = editorScene(spec({ shape: 'box', size: [1, 1, 1], parent: 'nowhere' }));
    expect(scene.issues.some((i) => i.path === 'parts[0].parent')).toBe(true);
  });

  it('keeps positions, normals and indices in step', () => {
    const geometry = meshGeometry(editorScene(spec({ shape: 'sphere', radius: 1 })).parts[0]!);
    expect(geometry.getAttribute('normal').count).toBe(geometry.getAttribute('position').count);
    expect(geometry.getIndex()!.count % 3).toBe(0);
  });
});
