import { describe, expect, it } from 'vitest';

import { captureFolderName, captureWarnings } from './media-map-capture';

describe('captureFolderName', () => {
  const at = new Date(Date.UTC(2026, 9, 7, 12, 3, 9));
  it('slugs a place and stamps UTC', () => {
    expect(captureFolderName({ center: [18.4, -33.9], place: 'Table Mountain, Cape Town' }, at)).toBe('table-mountain-cape-town-20261007-120309');
  });
  it('falls back to lat_lon', () => {
    expect(captureFolderName({ center: [18.4241, -33.9249] }, at)).toBe('m33.9249_18.4241-20261007-120309');
  });
});

describe('captureWarnings', () => {
  it('blocks over the cap and under the minimum', () => {
    expect(captureWarnings({ center: [0, 0], sideM: 70000 }, 1025, { nativeMPerPx: 5 })[0]).toMatchObject({ code: 'over-cap', blocking: true });
    expect(captureWarnings({ center: [0, 0], sideM: 10 }, 129, { nativeMPerPx: 5 })[0]).toMatchObject({ code: 'under-min', blocking: true });
  });
  it('warns, without blocking, when the DEM is coarser than the output', () => {
    const w = captureWarnings({ center: [0, 0], sideM: 1000 }, 1025, { nativeMPerPx: 30 });
    expect(w).toEqual([{ code: 'dem-coarser', message: 'The elevation data is ~30 m/px here; a smaller size gives the same detail.', blocking: false }]);
  });
  it('is quiet for a sane frame', () => {
    expect(captureWarnings({ center: [0, 0], sideM: 5000 }, 513, { nativeMPerPx: 10 })).toEqual([]);
  });
});
