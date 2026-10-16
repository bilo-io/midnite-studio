// Layer: vitest — pure colour math, no canvas/DOM needed (the token resolver is injected).
import { describe, expect, it } from 'vitest';

import { hslTripleToRgbString } from './knowledge-color-math';
import {
  communityColor,
  communityColorBucket,
  parseHslTriple,
} from './knowledge-community-colors';

describe('parseHslTriple', () => {
  it('parses a styles.css-shaped triple', () => {
    expect(parseHslTriple('217 91% 60%')).toEqual({ h: 217, s: 91, l: 60 });
  });

  it('returns null for anything else', () => {
    expect(parseHslTriple('')).toBeNull();
    expect(parseHslTriple('#ffffff')).toBeNull();
    expect(parseHslTriple('rgb(1,2,3)')).toBeNull();
  });
});

describe('communityColorBucket', () => {
  it('cycles hue buckets every 8 communities', () => {
    expect(communityColorBucket(0).hueIndex).toBe(0);
    expect(communityColorBucket(7).hueIndex).toBe(7);
    expect(communityColorBucket(8).hueIndex).toBe(0);
  });

  it('is deterministic for the same community', () => {
    expect(communityColorBucket(413)).toEqual(communityColorBucket(413));
  });

  it('advances the lightness tier once the hue wheel has gone around once', () => {
    expect(communityColorBucket(0).tierIndex).toBe(0);
    expect(communityColorBucket(8).tierIndex).toBe(1);
  });

  it('never produces a negative index', () => {
    for (let community = 0; community < 600; community += 1) {
      const { hueIndex, tierIndex } = communityColorBucket(community);
      expect(hueIndex).toBeGreaterThanOrEqual(0);
      expect(tierIndex).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('communityColor', () => {
  const resolveToken = () => '217 91% 60%';

  it('produces an rgb() string — sigma\'s colour parser only understands #hex/rgb(), never hsl()', () => {
    expect(communityColor(0, resolveToken)).toBe(hslTripleToRgbString(217, 91, 60));
    expect(communityColor(0, resolveToken)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });

  it('offsets lightness by tier without ever leaving the legible range', () => {
    const color = communityColor(8, resolveToken); // tier 1: -14
    expect(color).toBe(hslTripleToRgbString(217, 91, 46));
  });

  it('clamps a low offset at the minimum legible lightness', () => {
    const veryDark = () => '217 91% 5%'; // tier 1 (community 8) subtracts 14: 5 - 14 = -9, clamped up to 12
    expect(communityColor(8, veryDark)).toBe(hslTripleToRgbString(217, 91, 12));
  });

  it('clamps a high offset at the maximum legible lightness', () => {
    const veryLight = () => '217 91% 95%'; // tier 2 (community 16) adds 14: 95 + 14 = 109, clamped down to 88
    expect(communityColor(16, veryLight)).toBe(hslTripleToRgbString(217, 91, 88));
  });

  it('falls back to a neutral grey when the token does not resolve', () => {
    expect(communityColor(0, () => '')).toBe('rgb(136, 136, 136)');
  });
});
