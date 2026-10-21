import { describe, expect, it } from 'vitest';

import { alphaBounds, lowerBandCentroid, normaliseFrame, resizeArea, spriteReferenceFrame, spriteScale } from './align';
import { discOn, rectOn } from './test-fixtures';
import { keyChroma, SPRITE_CHROMA_MAGENTA } from './key';

const opts = { frameSize: [64, 64] as const, anchor: { x: 0.5, y: 1 }, referenceHeight: 24 };

describe('alignment', () => {
  it('finds alpha bounds and the lower-band centroid', () => {
    const img = rectOn(40, 40, 10, 5, 8, 20);
    expect(alphaBounds(img)).toEqual({ x0: 10, y0: 5, x1: 18, y1: 25 });
    expect(lowerBandCentroid(img)).toBe(14);
    expect(alphaBounds(rectOn(8, 8, 0, 0, 0, 0))).toBeNull();
  });

  it('two discs offset by (7, 3) px normalise to identical images', () => {
    const a = keyChroma(discOn(96, 40, 40, 12, '#2050d0', SPRITE_CHROMA_MAGENTA), SPRITE_CHROMA_MAGENTA);
    const b = keyChroma(discOn(96, 47, 43, 12, '#2050d0', SPRITE_CHROMA_MAGENTA), SPRITE_CHROMA_MAGENTA);
    const na = normaliseFrame(a, opts);
    const nb = normaliseFrame(b, opts);
    expect(Array.from(na.image.data)).toEqual(Array.from(nb.image.data));
    expect(na.scale).toBeCloseTo(spriteScale(opts));
  });

  it('puts the baseline on the anchor and the feet centroid on its x', () => {
    const { image } = normaliseFrame(rectOn(50, 50, 3, 3, 10, 24), opts);
    const box = alphaBounds(image)!;
    expect(box.y1).toBe(64);
    expect(lowerBandCentroid(image)).toBeCloseTo(32, 0);
    expect(box.y1 - box.y0).toBe(Math.round(24 * spriteScale(opts)));
  });

  it('applies the anchor nudge after placement', () => {
    const plain = alphaBounds(normaliseFrame(rectOn(50, 50, 3, 3, 10, 24), opts).image)!;
    const nudged = alphaBounds(normaliseFrame(rectOn(50, 50, 3, 3, 10, 24), { ...opts, nudge: [3, -2] }).image)!;
    expect([nudged.x0 - plain.x0, nudged.y0 - plain.y0]).toEqual([3, -2]);
  });

  it('pixel mode scales nearest-neighbour: no new alpha levels', () => {
    const { image } = normaliseFrame(rectOn(50, 50, 3, 3, 9, 13), { ...opts, pixel: true });
    const alphas = new Set<number>();
    for (let i = 3; i < image.data.length; i += 4) alphas.add(image.data[i]!);
    expect([...alphas].sort()).toEqual([0, 255]);
  });

  it('area-averages when shrinking', () => {
    const half = resizeArea(rectOn(4, 4, 0, 0, 2, 4), 2, 2);
    expect(half.data[3]).toBe(255);
    expect(half.data[7]).toBe(0);
  });

  it('an empty frame normalises to a transparent canvas', () => {
    const { image } = normaliseFrame(rectOn(10, 10, 0, 0, 0, 0), opts);
    expect(image.width).toBe(64);
    expect(alphaBounds(image)).toBeNull();
  });

  it('the reference frame is idle frame 0, else the first clip', () => {
    const clip = (name: string) => ({ name, frames: 4, fps: 8, loop: 'loop' as const });
    expect(spriteReferenceFrame({ clips: [clip('walk'), clip('idle')] })).toEqual({ clip: 'idle', n: 0 });
    expect(spriteReferenceFrame({ clips: [clip('walk')] })).toEqual({ clip: 'walk', n: 0 });
    expect(spriteReferenceFrame({ clips: [] })).toBeNull();
  });
});
