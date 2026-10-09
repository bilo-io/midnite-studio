import { describe, expect, it } from 'vitest';

import { clampSide, defaultFrame, formatMPerPx, formatSide, frameFeatures, resizedSide, samplePoints } from './map-frame';

describe('map-frame', () => {
  it('draws a closed 64-segment outline and four corner handles', () => {
    const { outline, handles } = frameFeatures({ center: [18.4, -33.9], sideM: 5000 });
    const ring = (outline.features[0] as { geometry: { coordinates: number[][][] } }).geometry.coordinates[0]!;
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[64]);
    expect(handles.features).toHaveLength(4);
  });

  it('defaults to half the visible width, clamped to Terrain\'s limits', () => {
    const f = defaultFrame({ center: [0, 0], zoom: 10 }, 800);
    expect(f.size).toBe(1025);
    expect(f.sideM).toBeGreaterThan(30_000);
    expect(f.sideM).toBeLessThanOrEqual(65_536);
    expect(defaultFrame({ center: [0, 0], zoom: 22 }, 100).sideM).toBe(16);
    expect(clampSide(1e9)).toBe(65_536);
  });

  it('resizes about the centre from a dragged corner', () => {
    const side = resizedSide([0, 0], [0.05, -0.05]);
    expect(side).toBeGreaterThan(10_000);
    expect(side).toBeLessThan(12_000);
  });

  it('samples an n x n lattice and formats the readout', () => {
    expect(samplePoints({ center: [0, 0], sideM: 1000 })).toHaveLength(81);
    expect(formatSide(640)).toBe('640 m');
    expect(formatSide(12_345)).toBe('12.35 km');
    expect(formatMPerPx(1024, 1025)).toBe('1.00 m/px');
  });
});
