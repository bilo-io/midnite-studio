// Layer: vitest — pure colour math, no canvas needed.
import { describe, expect, it } from 'vitest';

import { hslToRgb, hslTripleToRgbString } from './knowledge-color-math';

describe('hslToRgb', () => {
  it('converts pure red', () => {
    expect(hslToRgb(0, 100, 50)).toEqual([255, 0, 0]);
  });

  it('converts pure green', () => {
    expect(hslToRgb(120, 100, 50)).toEqual([0, 255, 0]);
  });

  it('converts pure blue', () => {
    expect(hslToRgb(240, 100, 50)).toEqual([0, 0, 255]);
  });

  it('converts black and white at the lightness extremes', () => {
    expect(hslToRgb(217, 91, 0)).toEqual([0, 0, 0]);
    expect(hslToRgb(217, 91, 100)).toEqual([255, 255, 255]);
  });

  it('converts mid grey when saturation is zero, regardless of hue', () => {
    expect(hslToRgb(0, 0, 50)).toEqual([128, 128, 128]);
    expect(hslToRgb(217, 0, 50)).toEqual([128, 128, 128]);
  });

  it('wraps a hue outside 0..360', () => {
    expect(hslToRgb(360, 100, 50)).toEqual(hslToRgb(0, 100, 50));
    expect(hslToRgb(-120, 100, 50)).toEqual(hslToRgb(240, 100, 50));
  });
});

describe('hslTripleToRgbString', () => {
  it('formats as rgb(r, g, b) — the shape sigma\'s colour parser actually recognises', () => {
    expect(hslTripleToRgbString(0, 100, 50)).toBe('rgb(255, 0, 0)');
  });
});
