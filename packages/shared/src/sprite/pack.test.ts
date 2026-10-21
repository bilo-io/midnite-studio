import { describe, expect, it } from 'vitest';

import { createRgba } from './image';
import { blitExtruded, composeFrame, packRects, trimFrame } from './pack';
import { rectOn } from './test-fixtures';

/** A deterministic PRNG so the 500-rect case is the same every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const isPot = (n: number) => (n & (n - 1)) === 0;

describe('packRects', () => {
  it('places 500 random rects with no overlap (padding and extrude included), every page within maxSize and POT', () => {
    const rand = rng(7);
    const rects = Array.from({ length: 500 }, (_, i) => ({ key: `r${i}`, w: 4 + Math.floor(rand() * 200), h: 4 + Math.floor(rand() * 200) }));
    const padding = 3;
    const extrude = 1;
    const { pages } = packRects(rects, { maxSize: 2048, padding, extrude, pot: true });
    expect(pages.length).toBeGreaterThan(1);
    const placed = pages.flatMap((p) => p.placements);
    expect(placed.map((p) => p.key).sort()).toEqual(rects.map((r) => r.key).sort());
    for (const page of pages) {
      expect(page.w).toBeLessThanOrEqual(2048);
      expect(page.h).toBeLessThanOrEqual(2048);
      expect(isPot(page.w) && isPot(page.h)).toBe(true);
      const cells = page.placements.map((p) => ({ x: p.x - extrude, y: p.y - extrude, w: p.w + 2 * extrude + padding, h: p.h + 2 * extrude + padding }));
      for (const p of page.placements) {
        expect(p.x - extrude).toBeGreaterThanOrEqual(0);
        expect(p.y - extrude).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w + extrude).toBeLessThanOrEqual(page.w);
        expect(p.y + p.h + extrude).toBeLessThanOrEqual(page.h);
      }
      for (let i = 0; i < cells.length; i += 1)
        for (let j = i + 1; j < cells.length; j += 1) {
          const a = cells[i]!;
          const b = cells[j]!;
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap).toBe(false);
        }
    }
  });

  it('keeps one page tight when everything fits, and sizes it without POT when asked', () => {
    const { pages } = packRects(
      [
        { key: 'a', w: 30, h: 20 },
        { key: 'b', w: 30, h: 20 },
      ],
      { padding: 0, extrude: 0, pot: false },
    );
    expect(pages).toHaveLength(1);
    expect(pages[0]!.placements.map((p) => p.key)).toEqual(['a', 'b']);
    expect(pages[0]!.w * pages[0]!.h).toBe(1200);
  });

  it('refuses a rect that cannot fit a page on its own', () => {
    expect(() => packRects([{ key: 'huge', w: 2048, h: 10 }], { maxSize: 2048, extrude: 1 })).toThrow(/does not fit/);
  });
});

describe('trimFrame', () => {
  it('crops to the opaque pixels and records where the crop sat', () => {
    const t = trimFrame(rectOn(64, 64, 10, 20, 5, 7));
    expect(t.spriteSourceSize).toEqual({ x: 10, y: 20, w: 5, h: 7 });
    expect(t.sourceSize).toEqual({ w: 64, h: 64 });
    expect(t.trimmed).toBe(true);
    expect(t.image.width).toBe(5);
    expect(t.image.data[3]).toBe(255);
  });

  it('keeps one transparent pixel for an empty frame', () => {
    const t = trimFrame(createRgba(8, 8));
    expect(t.spriteSourceSize).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(t.image.data[3]).toBe(0);
  });
});

describe('blitExtruded', () => {
  it('repeats the edge pixels one px outward', () => {
    const page = createRgba(6, 6);
    blitExtruded(page, rectOn(2, 2, 0, 0, 2, 2), 2, 2, 1);
    const alpha = (x: number, y: number) => page.data[(y * 6 + x) * 4 + 3];
    expect(alpha(1, 1)).toBe(255);
    expect(alpha(4, 4)).toBe(255);
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(5, 5)).toBe(0);
  });
});

describe('composeFrame', () => {
  it('mirrors about the anchor column and then applies the nudge', () => {
    const img = rectOn(8, 4, 0, 0, 1, 1);
    const flipped = composeFrame(img, { flipped: true, anchorNudge: [0, 0] });
    expect(flipped.data[(0 * 8 + 7) * 4 + 3]).toBe(255);
    const moved = composeFrame(img, { flipped: true, anchorNudge: [-2, 1] });
    expect(moved.data[(1 * 8 + 5) * 4 + 3]).toBe(255);
    expect(moved.data[(0 * 8 + 7) * 4 + 3]).toBe(0);
  });
});
