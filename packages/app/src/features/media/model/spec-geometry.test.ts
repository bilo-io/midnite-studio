import { ModelSpecSchema, type ModelPartInput } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { createPartGeometry, geometryKey } from './spec-geometry';

const part = (input: ModelPartInput) => ModelSpecSchema.parse({ parts: [input] }).parts[0]!;
const bounds = (input: ModelPartInput) => {
  const geometry = createPartGeometry(part(input));
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  return { min: min.toArray(), max: max.toArray() };
};
const close = (actual: number[], expected: number[]) => actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 4));

describe('createPartGeometry matches the exported mesh', () => {
  it('box is centred', () => {
    const { min, max } = bounds({ shape: 'box', size: [2, 4, 6] });
    close(min, [-1, -2, -3]);
    close(max, [1, 2, 3]);
  });

  it('cylinder and cone are centred on their height', () => {
    close(bounds({ shape: 'cylinder', radiusTop: 1, radiusBottom: 2, height: 3 }).max, [2, 1.5, 2]);
    close(bounds({ shape: 'cone', radius: 1, height: 2 }).min, [-1, -1, -1]);
  });

  it('torus lies flat in x-z like the exported one', () => {
    const { min, max } = bounds({ shape: 'torus', radius: 2, tube: 0.5 });
    close(min, [-2.5, -0.5, -2.5]);
    close(max, [2.5, 0.5, 2.5]);
  });

  it('lathe revolves the profile about Y', () => {
    const { min, max } = bounds({ shape: 'lathe', profile: [[0, 0], [1, 0], [0.5, 2]] });
    close(min, [-1, 0, -1]);
    close(max, [1, 2, 1]);
  });

  it('extrude rises from y=0 over the x-z outline', () => {
    const { min, max } = bounds({ shape: 'extrude', height: 2, outline: [[0, 0], [3, 0], [3, 1], [0, 1]] });
    close(min, [0, 0, 0]);
    close(max, [3, 2, 1]);
  });
});

describe('geometryKey', () => {
  it('ignores transform, colour and name but not shape parameters', () => {
    const a = part({ shape: 'sphere', radius: 1, color: '#ff0000', name: 'x', position: [1, 2, 3] });
    const b = part({ shape: 'sphere', radius: 1, color: '#00ff00', name: 'y', scale: [2, 2, 2] });
    expect(geometryKey(a)).toBe(geometryKey(b));
    expect(geometryKey(a)).not.toBe(geometryKey(part({ shape: 'sphere', radius: 2 })));
  });
});
