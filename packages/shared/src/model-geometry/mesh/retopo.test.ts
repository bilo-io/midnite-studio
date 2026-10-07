import { describe, expect, it } from 'vitest';

import { EditableMesh } from './editable-mesh';
import { uvSphere, isClosedManifold } from './pipeline-fixtures';
import { retopologize } from './retopo';
import { skinDrift, skinIsNormalised, transferSkinWeights } from './skin-transfer';

describe('retopologize', () => {
  it('lands near the target face count with a closed, quad-dominant surface on the source shape', () => {
    const sphere = uvSphere(1, 32, 16);
    const out = retopologize(sphere, { targetFaces: 1200 });
    expect(out.faces).toBeGreaterThan(1200 * 0.8);
    expect(out.faces).toBeLessThan(1200 * 1.2);
    expect(isClosedManifold(out.indices)).toBe(true);
    expect(out.quadShare).toBeGreaterThan(0.8);
    // Snapped back onto the sphere.
    for (let v = 0; v < out.positions.length; v += 3) expect(Math.abs(Math.hypot(out.positions[v]!, out.positions[v + 1]!, out.positions[v + 2]!) - 1)).toBeLessThan(0.06);
    // Every quad is four distinct vertices.
    for (let q = 0; q < out.quads.length; q += 4) expect(new Set([out.quads[q], out.quads[q + 1], out.quads[q + 2], out.quads[q + 3]]).size).toBe(4);
  });
});

describe('transferSkinWeights', () => {
  it('carries weights across a topology change, normalised to four influences', () => {
    const sphere = uvSphere(1, 24, 12);
    const n = sphere.positions.length / 3;
    // Two bones split at the equator, blending across a band.
    const joints = new Array<number>(n * 4).fill(0);
    const weights = new Array<number>(n * 4).fill(0);
    for (let v = 0; v < n; v += 1) {
      const y = sphere.positions[v * 3 + 1]!;
      const upper = Math.min(1, Math.max(0, 0.5 + y * 2));
      joints[v * 4] = 0;
      joints[v * 4 + 1] = 1;
      weights[v * 4] = upper;
      weights[v * 4 + 1] = 1 - upper;
    }
    const retopo = retopologize(sphere, { targetFaces: 500 });
    const moved = transferSkinWeights({ positions: sphere.positions, indices: sphere.indices, skin: { joints, weights } }, retopo.positions, { dstIndices: retopo.indices });
    const count = retopo.positions.length / 3;
    expect(skinIsNormalised(moved, count)).toBe(true);
    for (let v = 0; v < count; v += 1) {
      const y = retopo.positions[v * 3 + 1]!;
      const expected = Math.min(1, Math.max(0, 0.5 + y * 2));
      const got = moved.weights[v * 4]! * (moved.joints[v * 4] === 0 ? 1 : 0) + moved.weights[v * 4 + 1]! * (moved.joints[v * 4 + 1] === 0 ? 1 : 0);
      expect(Math.abs(got - expected)).toBeLessThan(0.2);
    }
    expect(skinDrift(moved, moved, count)).toEqual({ mean: 0, max: 0 });
    const mesh = new EditableMesh({ positions: retopo.positions, indices: retopo.indices });
    expect(mesh.isClosed()).toBe(true);
  });

  it('limits to four influences even when more bones overlap', () => {
    const grid = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), indices: new Uint32Array([0, 1, 2]) };
    const skin = { joints: [0, 1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4], weights: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25] };
    const out = transferSkinWeights({ ...grid, skin }, [0.3, 0, 0.3]);
    expect(out.weights.filter((w) => w > 0).length).toBeLessThanOrEqual(4);
    expect(skinIsNormalised(out, 1)).toBe(true);
  });
});
