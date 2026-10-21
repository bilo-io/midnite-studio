import { describe, expect, it } from 'vitest';
import { alignmentMatrix, imageUvToTerrain, terrainToImageUv } from './align';

describe('terrain alignment', () => {
  it('identity maps corners to corners', () => {
    const corners: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (const [u, v] of corners) {
      const [tu, tv] = imageUvToTerrain(u, v);
      expect(tu).toBeCloseTo(u, 9);
      expect(tv).toBeCloseTo(v, 9);
      const [iu, iv] = terrainToImageUv(tu, tv);
      expect(iu).toBeCloseTo(u, 9);
      expect(iv).toBeCloseTo(v, 9);
    }
  });

  it('offset [0.5, 0] shifts by half the world', () => {
    const [tu, tv] = imageUvToTerrain(0, 0, { offset: [0.5, 0], scale: [1, 1], rotationDeg: 0 });
    expect(tu).toBeCloseTo(0.5, 9);
    expect(tv).toBeCloseTo(0, 9);

    const [cu, cv] = imageUvToTerrain(0.5, 0.5, { offset: [0.5, 0], scale: [1, 1], rotationDeg: 0 });
    expect(cu).toBeCloseTo(1.0, 9);
    expect(cv).toBeCloseTo(0.5, 9);
  });

  it('rotationDeg: 90 sends (1, 0) to (0, 1) about the centre', () => {
    // Relative to centre (0.5, 0.5), direction (0.5, 0) (i.e. point [1, 0.5])
    // rotated by 90 deg becomes direction (0, 0.5) (i.e. point [0.5, 1])
    const [tu, tv] = imageUvToTerrain(1, 0.5, { offset: [0, 0], scale: [1, 1], rotationDeg: 90 });
    expect(tu).toBeCloseTo(0.5, 9);
    expect(tv).toBeCloseTo(1, 9);

    // Also verify direction vector relative to centre:
    // [1 - 0.5, 0.5 - 0.5] = [0.5, 0] -> [tu - 0.5, tv - 0.5] = [0, 0.5]
    // Normalized direction (1, 0) becomes (0, 1).
    const dirX = (tu - 0.5) / 0.5;
    const dirY = (tv - 0.5) / 0.5;
    expect(dirX).toBeCloseTo(0, 9);
    expect(dirY).toBeCloseTo(1, 9);
  });

  it('alignmentMatrix matches imageUvToTerrain', () => {
    const align = { offset: [0.1, -0.2] as [number, number], scale: [1.5, 0.8] as [number, number], rotationDeg: 45 };
    const m = alignmentMatrix(align);
    const [u, v] = [0.3, 0.7];
    const [tu, tv] = imageUvToTerrain(u, v, align);

    const matU = m[0] * u + m[1] * v + m[2];
    const matV = m[3] * u + m[4] * v + m[5];

    expect(matU).toBeCloseTo(tu, 9);
    expect(matV).toBeCloseTo(tv, 9);
  });

  it('imageUvToTerrain(terrainToImageUv(p)) is within 1e-9 of p for 100 random alignments', () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < 100; i += 1) {
      const align = {
        offset: [rng() * 2 - 1, rng() * 2 - 1] as [number, number],
        scale: [rng() * 9.9 + 0.1, rng() * 9.9 + 0.1] as [number, number],
        rotationDeg: rng() * 360 - 180,
      };

      const p: [number, number] = [rng(), rng()];
      const imgUv = terrainToImageUv(p[0], p[1], align);
      const [reconU, reconV] = imageUvToTerrain(imgUv[0], imgUv[1], align);

      expect(reconU).toBeCloseTo(p[0], 9);
      expect(reconV).toBeCloseTo(p[1], 9);
    }
  });
});
