import { describe, expect, it } from 'vitest';

import { frameRing, inverse } from './map';

describe('frameRing (Phase 108 Theme C)', () => {
  for (const lat of [0, 60]) {
    it(`keeps all four sides equal to sideM at lat ${lat} (Vincenty, within 0.1%)`, () => {
      const sideM = 20_000;
      const ring = frameRing([10, lat], sideM, 16);
      expect(ring).toHaveLength(65);
      for (const corner of [0, 16, 32, 48]) {
        const { distanceM } = inverse(ring[corner]!, ring[corner + 16]!);
        expect(Math.abs(distanceM - sideM) / sideM).toBeLessThan(0.001);
      }
    });
  }
});
